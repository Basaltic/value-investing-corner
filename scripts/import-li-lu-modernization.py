#!/usr/bin/env python3
"""Import/verify Li Lu's 2018 modernization article. Requires PyMuPDF.

Run: python3 scripts/import-li-lu-modernization.py [--verify]
Retains original character order, all six headings and bold emphasis.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SLUG = "modernization-and-us-china-relations"
PDF = ROOT / f"apps/web/public/materials/li-lu/{SLUG}.pdf"
ARTICLE = ROOT / f"content/knowledge/masters/li-lu/{SLUG}.md"
TITLE = "李录谈现代化系列：从人类文明史角度看当今中美关系走向"
URL = "https://cdn.prod.website-files.com/5ef3c7300432b40ed865991a/5f0934f93967fc62fa42c844_%E6%9D%8E%E5%BD%95%E8%B0%88%E7%8E%B0%E4%BB%A3%E5%8C%96-%E4%BB%8E%E4%BA%BA%E7%B1%BB%E6%96%87%E6%98%8E%E5%8F%B2%E8%A7%92%E5%BA%A6%E7%9C%8B%E5%BD%93%E4%BB%8A%E4%B8%AD%E7%BE%8E%E5%85%B3%E7%B3%BB%E8%B5%B0%E5%90%91.pdf"
START = "<!-- 原文开始 -->"
END = "<!-- 原文结束 -->"


def normalize(text):
    return re.sub(r"\s+", "", text)


def verify(doc):
    md = ARTICLE.read_text(encoding="utf-8")
    body = md.split(START, 1)[1].split(END, 1)[0]
    body = re.sub(r"(?m)^## ", "", body).replace("**", "")
    body = normalize(html.unescape(body).replace("\\{", "{").replace("\\}", "}"))
    offset = 0
    for number, page in enumerate(doc, 1):
        # Independent plain-text extraction, not import layout coordinates.
        lines = [line.strip() for line in page.get_text("text", sort=True).splitlines() if line.strip()]
        assert lines[-1] == str(number), f"Unexpected footer on page {number}"
        lines.pop()
        if number == 1:
            assert lines.pop(0) == TITLE
        expected = normalize("".join(lines))
        assert body[offset:offset + len(expected)] == expected, f"Mismatch on page {number}"
        offset += len(expected)
    assert offset == len(body), "Added content in original transcript"
    assert len(re.findall(r"(?m)^## [1-6]\. ", md)) == 6
    assert "\ufffd" not in md
    assert not re.search(r"(?m)^\d+\s*$", md), "Standalone page numbers remain"
    original_body = md.split(START, 1)[1].split(END, 1)[0]
    bold_runs = re.findall(r"\*\*(.*?)\*\*", original_body, re.DOTALL)
    expected_bold = ""
    for page in doc:
        for block in page.get_text("dict", sort=True)["blocks"]:
            for line in block.get("lines", []):
                line_text = "".join(s["text"] for s in line["spans"]).strip()
                if line_text == TITLE or re.match(r"^[1-6]\.\s", line_text):
                    continue
                expected_bold += "".join(s["text"] for s in line["spans"] if s["flags"] & 16)
    assert normalize("".join(bold_runs)) == normalize(expected_bold), "Original emphasis mismatch"
    print(json.dumps({"source_pages_verified": len(doc), "original_characters_verified": len(body),
                      "original_headings": 6, "original_bold_runs": len(bold_runs),
                      "original_emphasis_preserved": True,
                      "all_original_character_order_preserved": True,
                      "source_images": sum(len(p.get_images()) for p in doc)}, ensure_ascii=False, indent=2))


def generate(doc):
    if ARTICLE.exists():
        raise SystemExit(f"Refusing to overwrite existing article: {ARTICLE}")
    events = []
    for number, page in enumerate(doc, 1):
        data = page.get_text("dict", sort=True, flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
        for block in data["blocks"]:
            for line in block.get("lines", []):
                spans = line["spans"]
                text = "".join(span["text"] for span in spans).strip()
                x, y, _, _ = line["bbox"]
                if not text or y >= 725 or (number == 1 and y < 100):
                    continue
                kind = "heading" if re.match(r"^[1-6]\.\s", text) else "text"
                events.append((number, y, x, kind, spans))
    events.sort(key=lambda event: (event[0], event[1]))
    fragments = []
    pending = []
    pending_kind = "text"

    def flush():
        nonlocal pending
        if not pending:
            return
        runs = []
        previous = ""
        for spans in pending:
            for span in spans:
                text = span["text"]
                bold = bool(span["flags"] & 16) and pending_kind != "heading"
                if previous and re.search(r"[A-Za-z]$", previous) and re.match(r"^[A-Za-z]", text):
                    text = " " + text
                if runs and runs[-1][1] == bold:
                    runs[-1] = (runs[-1][0] + text, bold)
                else:
                    runs.append((text, bold))
                previous = text
        output = ""
        for text, bold in runs:
            text = re.sub(r"\s+", " ", text)
            text = re.sub(r"(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])", "", text)
            text = text.replace("<", "&lt;").replace("{", "\\{").replace("}", "\\}")
            if bold and text.strip():
                leading = " " if text.startswith(" ") else ""
                trailing = " " if text.endswith(" ") else ""
                output += leading + "**" + text.strip() + "**" + trailing
            else:
                output += text
        fragments.append(("## " if pending_kind == "heading" else "") + output.strip())
        pending = []

    for _, _, x, kind, spans in events:
        if kind != pending_kind or (kind == "text" and x >= 100):
            flush()
        pending_kind = kind
        pending.append(spans)
    flush()
    frontmatter = f"""---
title: {TITLE}
description: 李录2018年12月13日文章全文，从人类文明史和现代化演进角度讨论中美关系。
category: 向大师学习
updated: "2026-10-19"
tags: [李录, 现代化, 文明演进, 中美关系, 专题文章]
---

> 来源：[原始 PDF]({URL}) · [站内 PDF 存档](/materials/li-lu/{SLUG}.pdf)。
>
> 转换说明：依据原 PDF 全文转换，保留原有六个章节和重点加粗，仅整理断行、段落及标题，删除排版页码。原文措辞、数据与观点未作改写或更新。文中的“今天”“今年”等指文章写作当时，不代表当前情况。原 PDF 无独立图表。

{START}

"""
    ARTICLE.write_text(frontmatter + "\n\n".join(fragments) + f"\n\n{END}\n", encoding="utf-8")
    verify(doc)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    with pymupdf.open(PDF) as doc:
        assert len(doc) == 15
        texts = [p.get_text("text", sort=True) for p in doc]
        assert all(t.strip() for t in texts)
        assert len(set(hashlib.sha256(t.encode()).hexdigest() for t in texts)) == len(texts)
        assert not any("\ufffd" in t for t in texts)
        verify(doc) if args.verify else generate(doc)


if __name__ == "__main__":
    main()
