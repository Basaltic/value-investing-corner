#!/usr/bin/env python3
"""Import/verify the full 92-page Li Lu modernization PDF. Requires PyMuPDF.

Run: python3 scripts/import-li-lu-modernization-full.py [--verify]
Retains all narrative, original emphasis, chapter introductions and 23 images.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SLUG = "li-lu-on-modernization-full"
PDF = ROOT / f"apps/web/public/materials/li-lu/{SLUG}.pdf"
ASSETS = PDF.parent
ARTICLE = ROOT / f"content/knowledge/masters/li-lu/{SLUG}.md"
URL = "https://cdn.prod.website-files.com/5ef3c7300432b40ed865991a/5f0935ee7646e6ff74f6d311_%E6%9D%8E%E5%BD%95%E8%B0%88%E7%8E%B0%E4%BB%A3%E5%8C%96%20%EF%BC%88%E5%85%A8%E6%96%87%EF%BC%89%E5%A4%A7%E5%AD%97%E5%8F%B7.pdf"
CHAPTER_PAGES = [3, 8, 15, 23, 29, 36, 42, 47, 52, 58, 63, 68, 72, 79, 84, 88]
START = "<!-- 原文开始 -->"
END = "<!-- 原文结束 -->"


def normalize(text):
    return re.sub(r"\s+", "", text)


def source_lines(doc):
    all_lines = []
    for number, page in enumerate(doc, 1):
        lines = []
        data = page.get_text("dict", sort=True, flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
        for block in data["blocks"]:
            for line in block.get("lines", []):
                text = "".join(s["text"] for s in line["spans"])
                y = line["bbox"][1]
                if not text.strip() or y >= 725 or (number == 1 and "李录谈现代化" in text):
                    continue
                # The vector chart is retained as a faithful rendered image.
                if number == 30 and y >= 420:
                    continue
                lines.append(line)
        lines.sort(key=lambda line: (line["bbox"][1], line["bbox"][0]))
        all_lines.append(lines)
    return all_lines


def verify(doc):
    md = ARTICLE.read_text(encoding="utf-8")
    body = md.split(START, 1)[1].split(END, 1)[0]
    body = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", body)
    body = re.sub(r"(?m)^#{1,6} |^- ", "", body).replace("**", "")
    body = normalize(html.unescape(body).replace("\\{", "{").replace("\\}", "}"))
    expected = []
    for number, page in enumerate(doc, 1):
        if number == 30:
            # Independent coordinate filter: narrative is above the graph.
            text = page.get_text("text", sort=True, clip=pymupdf.Rect(0, 0, 612, 420))
            lines = [s.strip() for s in text.splitlines() if s.strip()]
        else:
            lines = [s.strip() for s in page.get_text("text", sort=True).splitlines() if s.strip()]
            assert lines.pop() == str(number), f"Unexpected page footer: {number}"
        if number == 1:
            assert lines.pop(0) == "李录谈现代化"
        if number == 2:
            lines = [re.sub(r"[.…]{2,}", "", line) for line in lines]
        expected.append(normalize("".join(lines)))
    offset = 0
    for number, text in enumerate(expected, 1):
        assert body[offset:offset + len(text)] == text, f"Original text mismatch on page {number}"
        offset += len(text)
    assert offset == len(body), "Extra or altered narrative"
    assert len(re.findall(r"(?m)^## ", md)) == 17
    assert len(re.findall(r"(?m)^- 第", md)) == 16
    assert "\ufffd" not in md
    images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", md)
    assert len(images) == 23
    for image in images:
        path = ROOT / "apps/web/public" / image.lstrip("/")
        assert path.is_file(), image
        pix = pymupdf.Pixmap(str(path))
        assert pix.width > 0 and pix.height > 0
    # Validate each emphasized original character through the font evidence.
    expected_bold = ""
    for number, lines in enumerate(source_lines(doc), 1):
        for index, line in enumerate(lines):
            if number == 2 or (number in CHAPTER_PAGES and index == 0):
                continue
            expected_bold += "".join(s["text"] for s in line["spans"] if s["flags"] & 16 or s["font"] == "SimHei")
    bold = re.findall(r"\*\*(.*?)\*\*", md.split(START, 1)[1], re.DOTALL)
    assert normalize("".join(bold)) == normalize(expected_bold), "Original emphasis mismatch"
    print(json.dumps({"pages_verified": len(doc), "original_characters_verified": len(body),
                      "chapter_count": 16, "contents_entries": 16, "images_verified": len(images),
                      "original_text_order_preserved": True, "original_emphasis_preserved": True},
                     ensure_ascii=False, indent=2))


def generate(doc):
    if ARTICLE.exists():
        raise SystemExit(f"Refusing to overwrite existing article: {ARTICLE}")
    events = []
    payloads = []
    for number, page in enumerate(doc, 1):
        for image_index, info in enumerate(page.get_image_info(xrefs=True), 1):
            name = f"{SLUG}-p{number:02}-image-{image_index:02}.png"
            bbox = pymupdf.Rect(info["bbox"])
            # Render the placed image: preserve original cropping and aspect ratio.
            payload = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=bbox, alpha=False).tobytes("png")
            payloads.append((ASSETS / name, payload))
            events.append((number, bbox.y0, "image", name, False))
    vector_name = f"{SLUG}-figure-06.png"
    payloads.append((ASSETS / vector_name, doc[29].get_pixmap(
        matrix=pymupdf.Matrix(3, 3), clip=pymupdf.Rect(70, 420, 574, 688), alpha=False).tobytes("png")))
    events.append((30, 420, "image", vector_name, False))
    for path, payload in payloads:
        if path.exists():
            assert path.read_bytes() == payload, f"Existing asset differs: {path}"
    for path, payload in payloads:
        if not path.exists():
            path.write_bytes(payload)

    for number, lines in enumerate(source_lines(doc), 1):
        previous_y = None
        for index, line in enumerate(lines):
            text = "".join(s["text"] for s in line["spans"])
            x, y, _, _ = line["bbox"]
            if number == 2:
                kind = "heading" if text.strip() == "目录" else "contents"
            elif number in CHAPTER_PAGES and index == 0:
                kind = "heading"
            else:
                kind = "text"
            # Detect original paragraph indentation and line-spacing changes.
            leading = len(text) - len(text.lstrip())
            new_paragraph = x >= 90 or leading >= 2 or (previous_y is not None and y - previous_y > 28)
            if (number == 19 and index == 0) or (number == 12 and text.strip().startswith("2000")):
                new_paragraph = False  # Centered continuation of a paragraph/caption.
            events.append((number, y, kind, line["spans"], new_paragraph))
            previous_y = y
    events.sort(key=lambda event: (event[0], event[1]))
    fragments = []
    pending = []
    pending_kind = "text"

    def flush():
        nonlocal pending
        if not pending:
            return
        runs = []
        last = ""
        for spans in pending:
            for span in spans:
                text = span["text"]
                bold = pending_kind == "text" and (bool(span["flags"] & 16) or span["font"] == "SimHei")
                if last and re.search(r"[A-Za-z]$", last) and re.match(r"[A-Za-z]", text):
                    text = " " + text
                if runs and runs[-1][1] == bold:
                    runs[-1] = (runs[-1][0] + text, bold)
                else:
                    runs.append((text, bold))
                last = text
        formatted = ""
        for text, bold in runs:
            text = re.sub(r"\s+", " ", text)
            text = re.sub(r"(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])", "", text)
            text = text.replace("<", "&lt;").replace("{", "\\{").replace("}", "\\}")
            if bold and text.strip():
                formatted += (" " if text.startswith(" ") else "") + "**" + text.strip() + "**" + (" " if text.endswith(" ") else "")
            else:
                formatted += text
        formatted = formatted.strip()
        if pending_kind == "heading":
            formatted = "## " + formatted
        elif pending_kind == "contents":
            formatted = "- " + re.sub(r"[.…]{2,}", " ", formatted)
        fragments.append(formatted)
        pending = []

    for number, _, kind, value, new_paragraph in events:
        if kind == "image":
            flush()
            label = f"原 PDF 第{number}页配图" if number != 30 else "图6：东西方社会发展指数（原 PDF 图表）"
            fragments.append(f"![{label}](/materials/li-lu/{value})")
            continue
        if kind != pending_kind or new_paragraph or kind in ("heading", "contents"):
            flush()
        pending_kind = kind
        pending.append(value)
    flush()
    frontmatter = f"""---
title: 李录谈现代化（全文）
description: 李录2014年7月《谈现代化》完整十六章，保留原文、导读、目录及全部配图。
category: 向大师学习
updated: "2026-10-19"
tags: [李录, 现代化, 文明演进, 十六讲, 全文]
---

> 来源：[原始 PDF]({URL}) · [站内 PDF 存档](/materials/li-lu/{SLUG}.pdf)。
>
> 转换说明：依据92页大字号原 PDF 全文转换，保留十六章、章节导读、重点加粗和全部23幅配图（含封面、章节插图及图表）。仅整理断行、段落、标题及目录的装饰引导线，删除页脚页码；目录末尾数字仍是原 PDF 页码。原目录与正文标题存在的措辞差异、错别字、历史数据和预测均照原文保留，未改写或更新。文中的“今天”“未来”等以原文2014年写作时点为基准，不代表当前事实或预测。

{START}

"""
    ARTICLE.write_text(frontmatter + "\n\n".join(fragments) + f"\n\n{END}\n", encoding="utf-8")
    verify(doc)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    with pymupdf.open(PDF) as doc:
        texts = [p.get_text("text", sort=True) for p in doc]
        assert len(doc) == 92 and all(t.strip() for t in texts)
        assert len(set(hashlib.sha256(t.encode()).hexdigest() for t in texts)) == 92
        assert not any("\ufffd" in t for t in texts)
        verify(doc) if args.verify else generate(doc)


if __name__ == "__main__":
    main()
