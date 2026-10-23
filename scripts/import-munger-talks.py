#!/usr/bin/env python3
"""Import user-supplied Munger PDFs as English Markdown; never translate.

Requires PyMuPDF. The scanned PDF additionally needs Apple Vision OCR JSON.
Usage: python scripts/import-munger-talks.py --source DIR --ocr JSON [--verify]
The audit records source hashes, every page, excluded layout text, and OCR caveats.
Existing articles are never overwritten by the importer.
"""
import argparse
import gzip
import hashlib
import json
import re
import shutil
import statistics
import subprocess
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "content/knowledge/masters/charlie-munger/speeches"
ASSETS = ROOT / "apps/web/public/materials/charlie-munger"
AUDIT = ROOT / "scripts/munger-talks-import-audit.json.gz"
START = "<!-- ORIGINAL ENGLISH TEXT START -->"
END = "<!-- ORIGINAL ENGLISH TEXT END -->"
ITEMS = [
    ("1986-commencement-speech-by-charlie-munger-at-harvard-school-now-harvard-westlake.pdf", "1986-harvard-school-commencement", "1986 — Speech to the Harvard School", "1986", "Commencement address", ""),
    ("1994-lecture-by-charlie-munger-at-usc-a-lesson-on-elementary-worldly-wisdom-as-it-relates-to-investment.pdf", "1994-usc-elementary-worldly-wisdom", "1994 — A Lesson on Elementary, Worldly Wisdom as It Relates to Investment Management & Business", "1994", "Lecture transcript", "The PDF identifies its publication as Outstanding Investor Digest's May 5, 1995 edition. Its original table of contents is retained."),
    ("1995-speech-by-charlie-munger-at-harvard-the-psychology-of-human-misjudgment.pdf", "1995-human-misjudgment-scanned", "The Psychology of Human Misjudgment — Scanned Version (Filename: 1995)", "1995", "Revised talk, scanned version", "Although the supplied filename says 1995, this PDF contains a preface and notes describing an extensive revision in 2005. It is not presented here as a verified 1995 verbatim transcript. All 27 scanned pages were recognized with English OCR, left column before right column. OCR is not a manually proofread transcription; residual recognition errors may remain. Consult the original PDF for exact wording."),
    ("1995_to_1998_Worldly-Wisdom-by-Munger.pdf", "1995-1998-worldly-wisdom-collection", "1995–1998 — Worldly Wisdom by Charlie Munger (Collection)", "1995–1998", "Lecture and notes collection", "This is a 50-page collection, not a single speech. Overlapping material is preserved separately rather than merged with the other PDFs."),
    ("1996-lecture-by-charlie-munger-at-stanford-law-school-worldly-wisdom-revisited-business-what-lawyers-should-know.pdf", "1996-stanford-worldly-wisdom-revisited", "Worldly Wisdom Revisited — Stanford Law School (Filename: 1996)", "1996", "Lecture excerpts and notes", "The filename says 1996, while the document labels Worldly Wisdom Revisited with December 29, 1997. The PDF starts on printed page 18 of the Worldly Wisdom collection, includes the end of a preceding lecture, and continues through other material. All supplied pages are retained; this is not labeled as an isolated complete Stanford transcript."),
    ("1996_Practical_thought_about_practical_thought_Mungers-analysis-to-build-a-Trillion-Dollar-Business-from-Scratch.pdf", "1996-practical-thought", "1996 — Practical Thought About Practical Thought?", "1996", "Adapted informal talk", "The PDF describes itself as an adaptation of Munger's July 20, 1996 informal talk. Original editorial material, source credit and footnotes are retained."),
    ("2000-talk-of-charlie-munger-to-breakfast-meeting-of-the-philanthropy-round-table.pdf", "2000-philanthropy-round-table", "2000 — Talk to the Philanthropy Round Table", "2000", "Breakfast meeting talk", ""),
    ("2003-speech-by-charlie-munger-at-ucsb-academic-economics-strengths-and-faults-after-considering-interdisciplinary.pdf", "2003-ucsb-academic-economics", "2003 — Academic Economics: Strengths and Faults After Considering Interdisciplinary Needs", "2003", "Lecture and Q&A transcript", ""),
    ("2005_revised_The+Psychology+of+Human+Misjudment.pdf", "2005-human-misjudgment-revised", "2005 — The Psychology of Human Misjudgment (Revised Version)", "2005", "Revised talk", "This 52-page FS.BLOG version is retained separately from the 27-page scanned version. Original introductory commentary is retained."),
    ("2007-USC-Law-School-Commencement-Address-by-Charlie-Munger-Transcript.pdf", "2007-usc-commencement-transcript", "2007 — USC Law School Commencement Address (Transcript Version)", "2007", "Commencement transcript", "Another supplied PDF records the same commencement address with different wording and layout. Both versions are retained without merging."),
    ("2007-commencement-speech-by-charlie-munger-at-usc-gould-school-of-law.pdf", "2007-usc-gould-commencement", "2007 — USC Gould School of Law Commencement Speech", "2007", "Commencement address", "Another supplied PDF records the same commencement address with different wording and layout. Both versions are retained without merging."),
    ("2008_DuBridge_Lecture.pdf", "2008-dubridge-lecture", "2008 — DuBridge Lecture at Caltech", "2008", "Conversation and audience Q&A", "This PDF is a printed web page. The full TRANSCRIPT section on PDF pages 1–11 is retained. Website menus, the video-player title, navigation icons and unrelated electronics-site footer (including page 12) are excluded. Source wording and apparent transcript errors are not rewritten."),
    ("2011-a-parody-about-the-great-recession.pdf", "2011-great-recession-parody", "2011 — Wantmore, Tweakmore, Totalscum, and the Tragedy of Boneheadia", "2011", "Satirical essay", "This is an essay headed A Parody about the Great Recession, not a speech transcript. It is archived in this menu with its actual material type identified. The original afterword is retained."),
    ("2014-vice-chairmans-thoughts-past-and-future.pdf", "2014-vice-chairmans-thoughts", "2014 — Vice Chairman’s Thoughts: Past and Future", "2014", "Shareholder commentary", "This is written commentary addressed to Berkshire Hathaway shareholders, not a speech transcript. The year follows the supplied filename; no external dating verification was performed."),
    ("2017-a-conversation-with-charlie-munger-at-university-of-michigan-ross.pdf", "2017-michigan-ross-conversation", "2017 — A Conversation with Charlie Munger at Michigan Ross", "2017", "Conversation transcript", ""),
]
LIGATURES = str.maketrans({"ﬁ": "fi", "ﬀ": "ff", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st", "\u00a0": " "})
# Corrections below were checked against the visible first scanned page, not another edition.
OCR_CORRECTIONS = {
    "01-0.png": {"When I tead": "When I read", "ettors and mnight": "errors and might", "ettors and might": "errors and might", "much diste-": "much disre-", "fot the condition": "for the condition"},
    "01-1.png": {"Old Valiant fox Truth": "Old Valiant for Truth", "Grocery Stote": "Grocery Store", "Few'Things": "Few Things", "mostly foi them-": "mostly for them-", "so, tight after": "so, right after", "peoplé": "people", "leaving Haivard": "leaving Harvard", "long struggie": "long struggle", "brief summaty": "brief summary"},
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def normalize(text):
    return text.translate(LIGATURES).strip()


def escape(text):
    # Fumadocs compiles .md as MDX. Escape syntax rather than executing source text.
    return re.sub(r"([\\`*_{}\[\]<>|#])", r"\\\1", text)


def block_text(block):
    lines = [normalize("".join(s["text"] for s in l["spans"])) for l in block["lines"]]
    return " ".join(x for x in lines if x)


def readable(text):
    dictionary = Path("/usr/share/dict/words")
    if not dictionary.is_file():
        return text
    words = set(dictionary.read_text().lower().splitlines())
    return re.sub(r"\b([A-Za-z]+)-\s+([a-z]+)\b", lambda m: m[1]+m[2] if (m[1]+m[2]).lower() in words else m[0], text)


def token_stream(text):
    return re.sub(r"\s+", "", readable(normalize(text)))


def extract_pages(path, ocr):
    doc = pymupdf.open(path)
    pages = []
    for i, page in enumerate(doc):
        parts, retained, excluded, image_records = [], [], [], []
        if path.name == ITEMS[2][0]:
            for col in range(2):
                column = ocr[f"{i+1:02d}-{col}.png"]
                baseline = statistics.median(l["x"] for l in column["lines"])
                previous_heading = False
                for line in column["lines"]:
                    text = normalize(line["text"])
                    for old, new in OCR_CORRECTIONS.get(column["file"], {}).items():
                        text = text.replace(old, new)
                    retained.append(text)
                    # Estimate body indent separately per column; scans shift horizontally.
                    heading = text.isupper() and len(text) < 100
                    new_para = line["x"] > baseline + .025 or heading or previous_heading
                    if new_para and parts:
                        parts.append("\n\n")
                    elif parts and not parts[-1].endswith("\n\n"):
                        parts.append(" ")
                    parts.append(("### " if heading else "") + escape(text))
                    previous_heading = heading
                parts.append("\n\n")
            pages.append({"page": i+1, "method": "Apple Vision English OCR", "raw": "\n".join(l["text"] for col in range(2) for l in ocr[f"{i+1:02d}-{col}.png"]["lines"]), "retained": "\n".join(retained), "excluded": [], "markdown": readable("".join(parts).strip()), "images": []})
            continue
        blocks = page.get_text("dict", sort=True)["blocks"]
        for block in blocks:
            if block["type"] != 0:
                continue
            text = block_text(block)
            if not text:
                continue
            y = block["bbox"][1]
            why = None
            if path.name == "2008_DuBridge_Lecture.pdf":
                if i == 0 and y < 440:
                    why = "website menu/title/player rather than transcript"
                if i == 10 and y >= 500 or i == 11:
                    why = "unrelated website footer"
            if path.name == "2005_revised_The+Psychology+of+Human+Misjudment.pdf":
                if y < 60 and text == "The Psychology of Human Misjudgment":
                    why = "repeated running header"
                if "FS.BLOG" in text and y > page.rect.height * .85:
                    why = "running footer and page number"
            if re.fullmatch(r"[-–]?\s*\d+\s*[-–]?", text) and y > page.rect.height * .8:
                why = "printed page number"
            if re.match(r"Worldly Wisdom by Charlie Munger 1995-1998\s+\d+$", text) and y > page.rect.height * .8:
                why = "running collection footer"
            if re.match(r"www\.csinvesting\.org.*page\s+\d+$", text) and y > page.rect.height * .8:
                why = "running publisher footer"
            if why:
                excluded.append({"text": text, "reason": why})
                continue
            icons = re.findall(r"[\ue000-\uf8ff]", text)
            if icons:
                excluded.append({"text": "".join(icons), "reason": "web navigation icon glyphs"})
                text = re.sub(r"[\ue000-\uf8ff]", "", text).strip()
                if not text:
                    continue
            retained.append(text)
            spans = [s for l in block["lines"] for s in l["spans"] if s["text"].strip()]
            bold = spans and all(s["flags"] & 16 for s in spans)
            heading = len(text) < 180 and (text.isupper() or bold) and not text.endswith(":") and not re.match(r"\(?\d+\)", text)
            parts.append(("### " if heading else "") + escape(text))
        # Retain the source's four editorial illustrations, not scans/player widgets.
        if path.name in [ITEMS[0][0], ITEMS[8][0], ITEMS[12][0]]:
            for n, im in enumerate(page.get_images(full=True), 1):
                rects = page.get_image_rects(im[0])
                if not rects:
                    continue
                image_records.append({"xref": im[0], "ordinal": n, "y": rects[0].y0})
        pages.append({"page": i+1, "method": "PyMuPDF text layer", "raw": page.get_text("text", sort=True), "retained": "\n".join(retained), "excluded": excluded, "markdown": "\n\n".join(parts), "images": image_records})
    return doc, pages


def generate(source, ocr):
    paths = [DEST / (x[1]+".md") for x in ITEMS] + [DEST/"index.md", DEST/"meta.json", AUDIT]
    assert not any(p.exists() for p in paths), "Refusing to overwrite existing import files"
    assert set(p.name for p in source.glob("*.pdf")) == {x[0] for x in ITEMS}
    DEST.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    audit = {"source_directory": str(source), "language": "English, untranslated", "ocr_caveat": "27 scanned pages: OCR with first-page visual corrections only; not full manual proofreading", "ocr": ocr, "ocr_visual_corrections": OCR_CORRECTIONS, "items": []}
    for filename, slug, title, year, kind, note in ITEMS:
        path = source / filename
        doc, pages = extract_pages(path, ocr)
        pdf_out = ASSETS / (slug+".pdf")
        assert not pdf_out.exists()
        shutil.copyfile(path, pdf_out)
        body_parts = []
        for p in pages:
            body = p.pop("markdown")
            for im in p["images"]:
                data = doc.extract_image(im["xref"])
                if data["ext"] == "jpx":
                    pixmap = pymupdf.Pixmap(doc, im["xref"])
                    if pixmap.n > 4:
                        pixmap = pymupdf.Pixmap(pymupdf.csRGB, pixmap)
                    data = {"ext": "png", "image": pixmap.tobytes("png")}
                image_name = f"{slug}-p{p['page']:02d}-{im['ordinal']}.{data['ext']}"
                assert not (ASSETS/image_name).exists()
                (ASSETS/image_name).write_bytes(data["image"])
                im["file"] = image_name
                image_md = f"![Illustration from the supplied PDF](/materials/charlie-munger/{image_name})"
                # Keep each illustration on its original PDF page, following the first block.
                first, sep, rest = body.partition("\n\n")
                body = first+"\n\n"+image_md+("\n\n"+rest if sep else "")
            if body.strip():
                body_parts.append(f"<!-- PDF page {p['page']} -->\n\n{body}")
            p["retained_sha256"] = sha(token_stream(p["retained"]).encode())
        body = "\n\n".join(body_parts)
        metadata = f'''---
title: {json.dumps(title, ensure_ascii=False)}
description: {json.dumps(kind + '. English text converted from the supplied PDF; no translation.', ensure_ascii=False)}
category: "公开演讲"
updated: "2026-10-20"
tags: ["查理·芒格", "公开演讲", "English", "{kind}"]
---

> Archive note: Source file: `{filename}` ({len(doc)} PDF pages). The source text is kept in English without translation, summary or paraphrase. Only paragraph wrapping, Markdown syntax and running layout elements are adjusted. Dates and provenance follow the supplied material and have not been independently verified. {note}

[Back to Public Speeches](./index.md) · [Original PDF](/materials/charlie-munger/{slug}.pdf)

## Original English text

{START}

'''
        article = DEST/(slug+".md")
        article.write_text(metadata+body+f"\n\n{END}\n", encoding="utf-8")
        audit["items"].append({"source": filename, "source_sha256": sha(path.read_bytes()), "article": str(article.relative_to(ROOT)), "slug": slug, "title": title, "year": year, "kind": kind, "pdf_pages": len(doc), "pdf_output": str(pdf_out.relative_to(ROOT)), "pages": pages})
        doc.close()
    index = '''---
title: "Charlie Munger — Public Speeches and Original Materials"
description: "15 supplied PDF versions converted to English Markdown, arranged by filename year; no translation."
category: "公开演讲"
updated: "2026-10-20"
tags: ["查理·芒格", "公开演讲", "English", "Original materials"]
---

This archive contains **15 supplied PDF versions**, converted to English Markdown without translation. Lectures, conversations, collections and written materials are labeled by their actual form. Versions with overlapping content are retained separately. Years in the ordering follow the supplied filenames; material-specific discrepancies are explained on the article pages.

> The 27-page scanned Psychology of Human Misjudgment PDF includes a 2005 revision despite its 1995 filename. It was converted with OCR and may contain residual recognition errors. The separate 52-page revised version is also preserved. Both 2007 USC commencement PDFs remain available as distinct source versions. Each article links to its original PDF for comparison.
'''
    prev = None
    for filename, slug, title, year, kind, note in ITEMS:
        if year != prev:
            index += f"\n## {year}\n"
            prev = year
        index += f"\n- [{title}](./{slug}.md) — {kind}.\n"
    index += "\n[Back to Charlie Munger](../index.md)\n"
    (DEST/"index.md").write_text(index, encoding="utf-8")
    (DEST/"meta.json").write_text(json.dumps({"title": "公开演讲", "pages": ["index"]+[x[1] for x in ITEMS]}, ensure_ascii=False, indent=2)+"\n",encoding="utf-8")
    with gzip.open(AUDIT, "wt", encoding="utf-8") as file:
        json.dump(audit, file, ensure_ascii=False, indent=2)
    verify(source)


def unescape(text):
    text = re.sub(r"<!--[^>]*-->", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    text = re.sub(r"(?m)^### ", "", text)
    return re.sub(r"\\([\\`*_{}\[\]<>|#])", r"\1", text)


def verify(source):
    with gzip.open(AUDIT, "rt", encoding="utf-8") as file:
        audit = json.load(file)
    ocr = audit["ocr"]
    checked = []
    for entry in audit["items"]:
        path = source/entry["source"]
        assert sha(path.read_bytes()) == entry["source_sha256"], path
        # Legacy audit records use public/...; assets now belong to apps/web.
        pdf_output = Path(entry["pdf_output"])
        if pdf_output.parts[0] == "public":
            pdf_output = Path("apps/web") / pdf_output
        assert sha((ROOT / pdf_output).read_bytes()) == entry["source_sha256"]
        doc, reread = extract_pages(path, ocr)
        text = (ROOT/entry["article"]).read_text(encoding="utf-8")
        body = text.split(START, 1)[1].split(END, 1)[0]
        expected = "\n".join(p["retained"] for p in reread)
        assert token_stream(unescape(body)) == token_stream(expected), f"Content mismatch: {path.name}"
        assert len(reread) == entry["pdf_pages"]
        assert "\ufffd" not in body
        assert not re.search(r"[\u4e00-\u9fff]", body), f"English body expected: {path.name}"
        for page in entry["pages"]:
            for image in page["images"]:
                assert (ASSETS/image["file"]).is_file()
        checked.append({"slug": entry["slug"], "pages": len(doc), "characters": len(expected), "text_equal_ignoring_layout_whitespace": True})
        doc.close()
    menu = json.loads((DEST/"meta.json").read_text())
    assert menu["title"] == "公开演讲"
    assert menu["pages"] == ["index"]+[x[1] for x in ITEMS]
    assert len(list(DEST.glob("*.md"))) == 16
    index = (DEST/"index.md").read_text()
    assert all(f"./{x[1]}.md" in index for x in ITEMS)
    print(json.dumps({"articles": len(checked), "pdf_pages": sum(x["pages"] for x in checked), "verified": checked, "menu_and_index": True, "ocr_manually_proofread": False}, ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--ocr", type=Path)
    p.add_argument("--verify", action="store_true")
    args = p.parse_args()
    if args.verify:
        verify(args.source)
    else:
        assert args.ocr and args.ocr.is_file()
        ocr = {x["file"]: x for x in json.loads(args.ocr.read_text())}
        assert len(ocr) == 54
        generate(args.source, ocr)


if __name__ == "__main__":
    main()
