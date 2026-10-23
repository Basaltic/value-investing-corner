#!/usr/bin/env python3
"""Import or verify Li Lu's December 2024 speech. Requires PyMuPDF.

Run: python3 scripts/import-li-lu-global-speech.py [--verify]
Existing articles are never overwritten.
"""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
SLUG = "global-value-investing-and-the-times-2024"
PDF = ROOT / "apps/web/public/materials/li-lu/global-value-investing-and-the-times-2024-12.pdf"
ARTICLE = ROOT / f"content/knowledge/masters/li-lu/{SLUG}.md"
URL = "https://cdn.prod.website-files.com/5ef3c7300432b40ed865991a/67a4f8e8160103c8a74017a7_%E5%85%A8%E7%90%83%E4%BB%B7%E5%80%BC%E6%8A%95%E8%B5%84%E4%B8%8E%E6%97%B6%E4%BB%A32024%E5%B9%B412%E6%9C%88.pdf"
START = "<!-- 原文开始 -->"
END = "<!-- 原文结束 -->"


def normalize(text):
    return re.sub(r"\s+", "", text)


def verify(doc):
    # Independent reading path: plain text, not the coordinate-based import.
    expected_pages = []
    for number, page in enumerate(doc, 1):
        text = page.get_text("text", sort=True)
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        lines = [line for line in lines if not re.fullmatch(r"\d+\s*\|\s*P\s*a\s*g\s*e", line)]
        if number == 1:
            assert lines.pop(0) == "全球价值投资与时代"
        expected_pages.append(normalize("".join(lines)))
    md = ARTICLE.read_text(encoding="utf-8")
    body = md.split(START, 1)[1].split(END, 1)[0]
    body = re.sub(r"(?m)^#{1,6} ", "", body)
    body = re.sub(r"(?m)^- ", "", body).replace("**", "")
    body = html.unescape(body).replace("\\{", "{").replace("\\}", "}")
    body = normalize(body)
    offset = 0
    for number, text in enumerate(expected_pages, 1):
        assert body[offset:offset + len(text)] == text, f"Narrative mismatch on page {number}"
        offset += len(text)
    assert offset == len(body), "Added text in original transcript"
    assert len(re.findall(r"(?m)^## ", md)) == 5
    assert len(re.findall(r"(?m)^### 问题[1-6][:：]", md)) == 6
    assert len(re.findall(r"(?m)^- [1-6]．", md)) == 6
    assert not re.search(r"\d+\s*\|\s*P\s*a\s*g\s*e", md)
    assert "\ufffd" not in md
    print(json.dumps({
        "pages_verified": len(expected_pages),
        "original_characters_verified": len(body),
        "all_original_character_order_preserved": True,
        "original_topic_sections": 4,
        "qa_sections": 1,
        "question_prompts": 6,
        "principles_list_items": 6,
        "source_images": sum(len(p.get_images()) for p in doc),
    }, ensure_ascii=False, indent=2))


def generate(doc):
    if ARTICLE.exists():
        raise SystemExit(f"Refusing to overwrite existing article: {ARTICLE}")
    events = []
    for page_number, page in enumerate(doc, 1):
        data = page.get_text("dict", sort=True, flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
        for block in data["blocks"]:
            for line in block.get("lines", []):
                text = "".join(span["text"] for span in line["spans"]).strip()
                x, y, _, _ = line["bbox"]
                if not text or y >= 725 or (page_number == 1 and y < 105):
                    continue
                size = max(span["size"] for span in line["spans"])
                if page_number == 1 and y < 130:
                    kind = "subtitle"
                elif page_number == 1 and y < 160:
                    kind = "author"
                elif text == "问答部分：" or size >= 15:
                    kind = "heading"
                elif re.match(r"^问题[1-6][:：]", text):
                    kind = "question"
                elif re.match(r"^[1-6]．", text):
                    kind = "list"
                elif page_number == 36 and text.startswith("2024 年"):
                    kind = "date"
                else:
                    kind = "text"
                events.append((page_number, y, x, kind, text))
    events.sort(key=lambda event: (event[0], event[1]))
    fragments = []
    pending = []
    pending_kind = "text"

    def flush():
        nonlocal pending
        if not pending:
            return
        joined = ""
        for text in pending:
            text = re.sub(r"\s+", " ", text).strip()
            if joined and re.search(r"[A-Za-z]$", joined) and re.match(r"[A-Za-z]", text):
                joined += " "
            joined += text
        joined = re.sub(r"(?<=[\u3400-\u9fff]) +(?=[\u3400-\u9fff])", "", joined)
        joined = joined.replace("<", "&lt;").replace("{", "\\{").replace("}", "\\}")
        if pending_kind == "heading":
            joined = "## " + joined
        elif pending_kind == "question":
            joined = "### " + joined
        elif pending_kind == "author":
            joined = "**" + joined + "**"
        elif pending_kind == "list":
            joined = "- " + joined
        fragments.append(joined)
        pending = []

    for _, _, x, kind, text in events:
        # Continuations of question/list paragraphs use ordinary 12-point text.
        continuation = kind == "text" and x < 90 and pending_kind in ("question", "list")
        if not continuation and (kind != pending_kind or x >= 90):
            flush()
        if not continuation:
            pending_kind = kind
        pending.append(text)
    flush()
    prefix = f"""---
title: 全球价值投资与时代
description: 李录2024年12月在北京大学光华管理学院《价值投资》课程十周年沙龙上的演讲全文及问答。
category: 向大师学习
updated: "2026-10-19"
tags: [李录, 价值投资, 公开演讲, 全球投资, 北大价值投资课程]
---

> 来源：[原始 PDF]({URL}) · [站内 PDF 存档](/materials/li-lu/global-value-investing-and-the-times-2024-12.pdf)。
>
> 转换说明：依据原 PDF 全文转换，保留四个主题、完整问答及文末日期；仅整理段落、断行、标题和列表，删除排版页码。原文措辞、错别字、数据及历史观点未作改写或更新。文中的“今天”“今年”等均指演讲当时，不代表当前市场情况。原 PDF 无独立图表。

{START}

"""
    ARTICLE.write_text(prefix + "\n\n".join(fragments) + f"\n\n{END}\n", encoding="utf-8")
    verify(doc)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    with pymupdf.open(PDF) as doc:
        assert len(doc) == 36, "Unexpected PDF page count"
        texts = [p.get_text("text", sort=True) for p in doc]
        assert all(t.strip() for t in texts), "Empty source pages"
        assert len(set(hashlib.sha256(t.encode()).hexdigest() for t in texts)) == len(texts)
        assert not any("\ufffd" in t for t in texts)
        verify(doc) if args.verify else generate(doc)


if __name__ == "__main__":
    main()
