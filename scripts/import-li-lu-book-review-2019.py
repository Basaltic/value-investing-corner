#!/usr/bin/env python3
"""Import/verify Li Lu's eight-page 2019 annual book review. Requires PyMuPDF.

Run: python3 scripts/import-li-lu-book-review-2019.py [--verify]
Preserves original narrative and the four-row economic-scenarios table.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SLUG = "annual-book-review-2019"
PDF = ROOT / f"apps/web/public/materials/li-lu/{SLUG}.pdf"
ARTICLE = ROOT / f"content/knowledge/masters/li-lu/{SLUG}.md"
TITLE = "李录2019年年度书评《大衰退年代：宏观经济学的另一半与全球化的宿命》"
URL = "https://cdn.prod.website-files.com/5ef3c7300432b40ed865991a/5f09347783851614276c3fdb_%E6%9D%8E%E5%BD%952019%E5%B9%B4%E5%B9%B4%E5%BA%A6%E4%B9%A6%E8%AF%84%202019.11.19.pdf"
START = "<!-- 原文开始 -->"
END = "<!-- 原文结束 -->"
TABLE_TOP, TABLE_BOTTOM = 365, 516
# PDF table boundaries verified visually against page 3.
COLS = [148, 279, 373, 464]
ROWS = [365, 381, 411, 442, 472, 517]


def normalize(text):
    return re.sub(r"\s+", "", text)


def escape(text):
    return text.replace("<", "&lt;").replace("{", "\\{").replace("}", "\\}")


def table_cells(doc):
    cells = []
    for y1, y2 in zip(ROWS, ROWS[1:]):
        row = []
        for x1, x2 in zip(COLS, COLS[1:]):
            text = doc[2].get_text("text", sort=True, clip=pymupdf.Rect(x1, y1, x2, y2))
            row.append(re.sub(r"\s+", " ", text).strip())
        cells.append(row)
    assert cells[0] == ["", "借款人/投资人", "储蓄者"]
    assert [r[1:] for r in cells[1:]] == [["有", "有"], ["有", "无"], ["无", "有"], ["无", "无"]]
    return cells


def source_narrative(page, number):
    if number == 3:
        text = page.get_text("text", sort=True, clip=pymupdf.Rect(0, 0, 612, TABLE_TOP))
        text += page.get_text("text", sort=True, clip=pymupdf.Rect(0, TABLE_BOTTOM + 1, 612, 724))
        return normalize(text)
    lines = [l.strip() for l in page.get_text("text", sort=True).splitlines() if l.strip()]
    assert lines.pop() == str(number), f"Unexpected page footer: {number}"
    if number == 1:
        assert normalize(lines.pop(0)) == TITLE
    return normalize("".join(lines))


def verify(doc):
    md = ARTICLE.read_text(encoding="utf-8")
    original = md.split(START, 1)[1].split(END, 1)[0]
    table_lines = [l for l in original.splitlines() if l.startswith("|")]
    assert len(table_lines) == 6
    actual_cells = [[c.strip() for c in l.split("|")[1:-1]] for i, l in enumerate(table_lines) if i != 1]
    assert [[normalize(c) for c in row] for row in actual_cells] == [[normalize(c) for c in row] for row in table_cells(doc)]
    narrative = re.sub(r"(?m)^\|.*\n?", "", original)
    narrative = normalize(html.unescape(narrative).replace("\\{", "{").replace("\\}", "}"))
    offset = 0
    page_counts = []
    for number, page in enumerate(doc, 1):
        expected = source_narrative(page, number)
        assert narrative[offset:offset + len(expected)] == expected, f"Narrative mismatch: page {number}"
        offset += len(expected)
        page_counts.append(len(expected))
    assert offset == len(narrative), "Extra or altered narrative"
    assert "\ufffd" not in md
    assert not re.search(r"(?m)^\d+\s*$", md)
    assert not re.search(r"(?m)^#{1,6} ", original), "Added headings not present in PDF"
    assert all(not (s["flags"] & 16) for p in doc for b in p.get_text("dict")["blocks"] for l in b.get("lines", []) for s in l["spans"])
    assert not any(p.get_images() for p in doc)
    print(json.dumps({"source_pages_verified": len(doc), "original_narrative_characters": len(narrative),
                      "per_page_narrative_characters": page_counts, "table_rows_verified": 4,
                      "table_columns_verified": 3, "table_cells_preserved": True,
                      "original_character_order_preserved": True, "source_images": 0}, ensure_ascii=False, indent=2))


def generate(doc):
    if ARTICLE.exists():
        raise SystemExit(f"Refusing to overwrite existing article: {ARTICLE}")
    fragments, pending = [], []

    def flush():
        if not pending:
            return
        text = ""
        for line in pending:
            if text and re.search(r"[A-Za-z]$", text) and re.match(r"^[A-Za-z]", line):
                text += " "
            text += line
        text = re.sub(r"\s+", " ", text).strip()
        text = re.sub(r"(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])", "", text)
        fragments.append(escape(text))
        pending.clear()

    for number, page in enumerate(doc, 1):
        lines = [l for b in page.get_text("dict", sort=True)["blocks"] for l in b.get("lines", [])]
        lines.sort(key=lambda l: (l["bbox"][1], l["bbox"][0]))
        table_added = False
        for line in lines:
            text = "".join(s["text"] for s in line["spans"])
            x, y, _, _ = line["bbox"]
            if not text.strip() or y >= 724 or (number == 1 and y < 100):
                continue
            if number == 3 and TABLE_TOP <= y < TABLE_BOTTOM:
                if not table_added:
                    flush()
                    cells = table_cells(doc)
                    table = ["| " + " | ".join(escape(c) for c in cells[0]) + " |", "| --- | --- | --- |"]
                    table += ["| " + " | ".join(escape(c) for c in row) + " |" for row in cells[1:]]
                    fragments.append("\n".join(table))
                    table_added = True
                continue
            if x >= 100:
                flush()
            pending.append(text)
    flush()
    frontmatter = f"""---
title: {TITLE}
description: 李录2019年11月19日年度书评全文，保留原文及四种经济情况表格。
category: 向大师学习
updated: "2026-10-19"
tags: [李录, 年度书评, 辜朝明, 大衰退年代, 宏观经济]
---

> 来源：[原始 PDF]({URL}) · [站内 PDF 存档](/materials/li-lu/{SLUG}.pdf)。
>
> 转换说明：依据8页原 PDF 全文转换，保留原文段落及四种经济情况表格。仅整理分页断行、空白及标题，删除页脚页码；表格转为可复制的 Markdown 表格。原文无独立配图或加粗强调。措辞、数据及历史观点均照原文保留，未作摘要、改写或更新。文中的“今年”“今天”“未来”等以2019年11月19日写作时点为基准，不代表当前事实或预测。

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
        assert len(doc) == 8 and all(t.strip() for t in texts)
        assert len(set(hashlib.sha256(t.encode()).hexdigest() for t in texts)) == 8
        assert not any("\ufffd" in t for t in texts)
        verify(doc) if args.verify else generate(doc)


if __name__ == "__main__":
    main()
