#!/usr/bin/env python3
"""Independently verify all speech prose and asset/menu links. Requires PyMuPDF."""
import html
import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
ARTICLE = ROOT / "content/knowledge/masters/li-lu/value-investing-in-china-2015.md"
md = ARTICLE.read_text(encoding="utf-8")
lines = md[md.index("首先感谢"):].splitlines()
prose = "".join(
    re.sub(r"^## ", "", line)
    for line in lines
    if line and not line.startswith(("![", "*图"))
)
prose = re.sub(r"\s+", "", html.unescape(prose))
source = pymupdf.open(ROOT / "public/materials/li-lu/value-investing-in-china-2015-10-23.pdf")
expected = ""
position = 0
checks = []
for number, page in enumerate(source, 1):
    text = ""
    data = page.get_text("dict", sort=True, flags=pymupdf.TEXTFLAGS_DICT & ~pymupdf.TEXT_PRESERVE_IMAGES)
    for block in data["blocks"]:
        for line in block.get("lines", []):
            spans = [span for span in line["spans"] if span["text"].strip()]
            if not spans:
                continue
            content = "".join(span["text"] for span in line["spans"]).strip()
            y = line["bbox"][1]
            size = max(span["size"] for span in spans)
            # The narrative uses 12-point type and original section headings 14-point.
            # Graph labels use smaller type, except these two chart titles.
            if size < 11.9 or y >= 725 or (number == 1 and y < 220):
                continue
            if number == 8 and content == "人类文明在过去五百多年中的经济表现":
                continue
            if number == 18 and content == "Total Return Indexes (1991 ~ 2014)":
                continue
            text += content
    text = re.sub(r"\s+", "", text)
    found = prose.find(text, position)
    assert found >= position, f"Missing or changed narrative on page {number}"
    position = found + len(text)
    expected += text
    checks.append({"page": number, "characters": len(text), "verified": True})
assert prose == expected, "Narrative contains added or changed characters"
assert len(source) == 28
images = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", md)
assert len(images) == 11
for image in images:
    path = ROOT / "public" / image.lstrip("/")
    assert path.is_file(), image
    decoded = pymupdf.Pixmap(str(path))
    assert decoded.width > 0 and decoded.height > 0
menu = json.loads((ROOT / "content/knowledge/masters/li-lu/meta.json").read_text(encoding="utf-8"))
assert menu["pages"] == ["index", "value-investing-in-china-2015", "materials"]
for file in ["index.md", "materials.md"]:
    assert "./value-investing-in-china-2015.md" in (ARTICLE.parent / file).read_text(encoding="utf-8")
print(json.dumps({
    "independent_page_checks": checks,
    "all_original_narrative_preserved": True,
    "narrative_characters": len(prose),
    "image_links_and_decodes": len(images),
    "menu_and_index_links_verified": True,
}, ensure_ascii=False, indent=2))
