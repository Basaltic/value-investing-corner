#!/usr/bin/env python3
"""Convert the locally archived Li Lu speech without rewriting its contents.

Requires PyMuPDF. Run from any directory:
    python3 scripts/import-li-lu-speech.py

The layout coordinates below refer only to the linked 28-page source PDF.
Existing files are not overwritten; menu integration is maintained separately.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "apps/web/public/materials/li-lu"
PDF = ASSETS / "value-investing-in-china-2015-10-23.pdf"
MARKDOWN = ROOT / "content/knowledge/masters/li-lu/value-investing-in-china-2015.md"
SOURCE_URL = (
    "https://cdn.prod.website-files.com/5ef3c7300432b40ed865991a/"
    "5f0936c4321954706fa9eca2_%E4%BB%B7%E5%80%BC%E6%8A%95%E8%B5%84%E5%9C%A8"
    "%E4%B8%AD%E5%9B%BD%E7%9A%84%E5%B1%95%E6%9C%9B-%E6%9D%8E%E5%BD%95"
    "2015-10-23%E5%8C%97%E5%A4%A7%E6%BC%94%E8%AE%B2.pdf"
)
# Page numbers are one-based. Bounds include each chart, caption and source.
FIGURES = [
    (1, 4, (80, 305, 542, 558), "美国自1801年至今大类资产的回报表现"),
    (2, 7, (95, 65, 495, 366), "人类文明在过去一万多年的经济表现"),
    (3, 8, (95, 120, 520, 458), "人类文明在过去五百多年的经济表现"),
    (4, 10, (100, 460, 520, 627), "1802年至2012年期间美国股市不同时间段的回报率"),
    (5, 18, (110, 350, 536, 604), "美国1991—2014年金融大类资产表现"),
    (6, 19, (110, 70, 536, 304), "中国1991年至今金融大类资产表现"),
    (7, 19, (140, 487, 445, 600), "中美1992年至今主要股市指数比较"),
    (8, 19, (90, 630, 540, 706), "中美港1991—2014年GDP成长比较"),
    (9, 20, (90, 351, 537, 548), "中国A股自1991年至今表现比较好的代表性公司"),
    (10, 21, (90, 136, 537, 333), "港股自1991年至今表现比较好的代表性公司"),
    (11, 22, (90, 65, 537, 436), "美股自1991年至今及历史上表现比较好的代表性公司"),
]


def normalize(text: str) -> str:
    return re.sub(r"\s+", "", text)


def join_lines(lines: list[str]) -> str:
    # Drop typographic CJK spacing, but retain spaces between Latin words.
    result = ""
    for line in lines:
        line = re.sub(r"\s+", " ", line).strip()
        if result and re.search(r"[A-Za-z]$", result) and re.match(r"[A-Za-z]", line):
            result += " "
        result += line
    result = re.sub(r"(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])", "", result)
    return result


def main() -> None:
    if MARKDOWN.exists():
        raise SystemExit(f"Refusing to overwrite existing article: {MARKDOWN}")
    doc = pymupdf.open(PDF)
    if len(doc) != 28:
        raise SystemExit("Unexpected PDF page count; verify the source before converting.")
    hashes = [hashlib.sha256(p.get_text("text", sort=True).encode()).hexdigest() for p in doc]
    assert len(set(hashes)) == len(doc), "Duplicate text pages in the source"
    assert all(p.get_text("text", sort=True).strip() for p in doc), "Empty source page"
    assert not any("\ufffd" in p.get_text("text") for p in doc), "Replacement characters"

    # Generate in memory first; an existing identical asset can be reused safely.
    paths = [ASSETS / f"value-investing-in-china-2015-figure-{n:02}.png" for n, *_ in FIGURES]
    rendered: list[bytes] = []
    for number, page_number, rect, _ in FIGURES:
        page = doc[page_number - 1]
        if number == 8:
            # The original caption is on the next page; retain both in one asset.
            with pymupdf.open() as combined:
                target = combined.new_page(width=450, height=102)
                target.show_pdf_page(pymupdf.Rect(0, 0, 450, 76), doc, 18, clip=pymupdf.Rect(rect))
                target.show_pdf_page(pymupdf.Rect(0, 76, 450, 102), doc, 19, clip=pymupdf.Rect(90, 65, 540, 91))
                image = target.get_pixmap(matrix=pymupdf.Matrix(3, 3), alpha=False)
        else:
            image = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), clip=pymupdf.Rect(rect), alpha=False)
        rendered.append(image.tobytes("png"))
    for path, payload in zip(paths, rendered):
        if path.exists():
            assert path.read_bytes() == payload, f"Existing asset differs: {path}"
    for path, payload in zip(paths, rendered):
        if not path.exists():
            path.write_bytes(payload)

    # Build a single reading-order stream, maintaining continuation across pages.
    events: list[tuple[int, float, str, str, float]] = []
    expected_pages: list[str] = []
    figure_regions = {i: [] for i in range(1, 29)}
    for number, page_number, rect, label in FIGURES:
        figure_regions[page_number].append(rect)
        events.append((page_number, rect[1], "figure", f"图{number}：{label}", float(number)))
    figure_regions[20].append((90, 65, 540, 91))

    for page_number, page in enumerate(doc, 1):
        source_lines: list[str] = []
        data = page.get_text("dict", sort=True, flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
        for block in data["blocks"]:
            for line in block.get("lines", []):
                text = "".join(span["text"] for span in line["spans"]).strip()
                x0, y0, x1, y1 = line["bbox"]
                if not text or y0 >= 725 or (page_number == 1 and y0 < 220):
                    continue
                center_y = (y0 + y1) / 2
                if any(rect[1] <= center_y <= rect[3] for rect in figure_regions[page_number]):
                    continue
                size = max(span["size"] for span in line["spans"])
                kind = "heading" if size >= 13.9 else "text"
                events.append((page_number, y0, kind, text, x0))
                source_lines.append(text)
        assert source_lines, f"No narrative text on page {page_number}"
        expected_pages.append(normalize("".join(source_lines)))
    events.sort(key=lambda event: (event[0], event[1]))

    fragments: list[str] = []
    narrative: list[str] = []
    pending: list[str] = []
    pending_kind = "text"

    def flush() -> None:
        nonlocal pending
        if pending:
            text = join_lines(pending)
            narrative.append(text)
            # MDX treats raw '<' and braces as syntax; escape only markup tokens.
            text = text.replace("\\", "\\\\").replace("<", "&lt;").replace("{", "\\{").replace("}", "\\}")
            fragments.append(("## " if pending_kind == "heading" else "") + text)
            pending = []

    for _, _, kind, text, x0 in events:
        if kind == "figure":
            flush()
            number = int(x0)
            asset = f"/materials/li-lu/value-investing-in-china-2015-figure-{number:02}.png"
            fragments.append(f"![{text}]({asset})\n\n*{text}（原 PDF 图表）*")
            continue
        if kind != pending_kind or (kind == "text" and x0 >= 90):
            flush()
        pending_kind = kind
        pending.append(text)
    flush()
    # Verify all original narrative characters are retained in original order.
    assert normalize("".join(narrative)) == "".join(expected_pages), "Narrative mismatch"
    heading_count = sum(f.startswith("## ") for f in fragments)
    assert heading_count == 4, f"Expected four original sections, found {heading_count}"

    frontmatter = """---
title: 价值投资在中国的展望
description: 李录2015年10月23日北大价值投资课程演讲全文，保留原文及11幅原始图表。
category: 向大师学习
updated: "2026-10-19"
tags: [李录, 价值投资, 公开演讲, 中国市场, 北大价值投资课程]
---

**李录 · 北大价值投资课程 · 2015年10月23日**

"""
    note = (
        f"> 来源：[原始 PDF]({SOURCE_URL}) · "
        "[站内 PDF 存档](/materials/li-lu/value-investing-in-china-2015-10-23.pdf)。\n>\n"
        "> 转换说明：本文依据原 PDF 全文转换，保留四部分结构、原文措辞、数字和11幅原始图表；"
        "仅整理断行、段落和标题，删除排版页码。原文中的错别字、图文数字差异及历史观点均保留，"
        "未作内容改写或数据更新。文中的“今天”“至今”等均指演讲当时，不代表当前市场情况。"
        "图表使用站点 public/materials/li-lu 目录中的本地图片，不依赖外部图片链接。\n\n"
    )
    MARKDOWN.write_text(frontmatter + note + "\n\n".join(fragments) + "\n", encoding="utf-8")
    print(json.dumps({
        "markdown": str(MARKDOWN), "pdf": str(PDF), "source_pages": len(doc),
        "original_sections": heading_count, "original_figures": len(FIGURES),
        "narrative_characters": sum(len(p) for p in expected_pages),
        "per_page_narrative_characters": [len(p) for p in expected_pages],
        "narrative_character_sequence_preserved": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
