#!/usr/bin/env python3
"""Import and independently verify user-provided Li Lu transcripts.

Usage: python3 scripts/import-li-lu-transcripts.py --source /path/to/LiLu [--verify]
Only writes new article files and the new speeches index/menu. Source files are read-only.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "content/knowledge/masters/li-lu/speeches"
START, END = "<!-- 原始资料开始 -->", "<!-- 原始资料结束 -->"
ITEMS = [
    ("2018年《红周刊》独家对话李录.md", "2018-hongzhoukan-interview", "2018年《红周刊》独家对话美国喜马拉雅资本创始人及董事长李录", "2018", "媒体专访", ""),
    ("2019年价值投资实践—李录北大演讲全文.md", "2019-peking-value-investing-practice", "价值投资实践——李录北大演讲全文", "2019", "演讲录音整理稿", ""),
    ("2019年国内专业投资人请教李录的39个问题.md", "2019-professional-investors-39-questions", "小雅笔记（独家） | 国内专业投资人请教李录的39个问题", "2019", "现场问答笔记", "原文说明此次交流原意并非公开发布，内容为小雅现场笔记，经李录过目但李录不对内容负责；该说明完整保留，不能当作李录本人核定的逐字稿。"),
    ("2019年知行合一的人生—李录先生讲座笔记.md", "2019-unity-of-knowledge-and-action-notes", "知行合一的人生——李录先生讲座笔记", "2019", "讲座笔记", "本篇为贾鹏的讲座笔记，包含笔记作者本人的思考，不是演讲逐字稿。"),
    ("2020年李录谈危机、创新、个人与世界.md", "2020-crisis-innovation-and-the-world", "2020年李录谈危机、创新、个人与世界", "2020", "访谈整理稿", "原文提及题图，但本次附件没有图片文件或图片引用，未补造图片。"),
    ("2021年2月36氪对话李录.md", "2021-36kr-interview", "2021年2月36氪对话李录", "2021", "媒体对话整理稿", ""),
    ("2021年4月李录对话哥伦比亚教授格林沃德.md", "2021-greenwald-dialogue", "李录对话哥伦比亚教授格林沃德", "2021", "对话整理稿", ""),
    ("2024年11月正和岛专访.md", "2024-zhenghedao-interview", "2024年11月正和岛专访", "2024", "媒体专访", ""),
    ("2024年12月全球价值投资与时代-李录哥伦比亚大学演讲.md", "2024-global-value-investing-transcript", "全球价值投资与时代（2024年文字稿版）", "2024", "演讲及问答文字稿", "本篇与本站已收录的同题PDF版对应同一活动，但排版、导语、强调和个别文字存在差异，作为不同资料版本分别保留，未合并或覆盖。附件文件名写作“哥伦比亚大学演讲”，原文导语则说明活动在哥伦比亚大学全球中心（北京）举行；本页不把文件名当作活动举办地的证明。"),
]


def source_body(path):
    text = path.read_text(encoding="utf-8")
    assert "\ufffd" not in text
    lines = text.splitlines()
    first = next((i for i, l in enumerate(lines) if l.strip()), None)
    if first is not None and re.match(r"^#{1,2}\s", lines[first]):
        lines.pop(first)  # Original title is retained in page metadata.
    return "\n".join(l.rstrip() for l in lines).strip()


def verify(source):
    output = []
    for filename, slug, title, year, kind, note in ITEMS:
        path = DEST / f"{slug}.md"
        text = path.read_text(encoding="utf-8")
        body = text.split(START + "\n\n", 1)[1].split("\n\n" + END, 1)[0]
        expected = source_body(source / filename)
        assert body == expected, f"Original content changed: {filename}"
        assert f'title: {json.dumps(title, ensure_ascii=False)}' in text
        assert text.count(START) == 1 and text.count(END) == 1
        output.append({"file": filename, "article": str(path.relative_to(ROOT)), "original_characters": len(expected), "sha256": hashlib.sha256(body.encode()).hexdigest(), "original_preserved": True})
    menu = json.loads((DEST / "meta.json").read_text())
    assert menu["title"] == "公开演讲"
    assert menu["pages"] == ["index"] + [x[1] for x in ITEMS]
    assert len(list(DEST.glob("*.md"))) == 10
    index = (DEST / "index.md").read_text()
    assert all(f"./{slug}.md" in index for _, slug, *_ in ITEMS)
    assert "../global-value-investing-and-the-times-2024.md" in index
    assert len(re.findall(r"(?m)^问\s*\d+：", source_body(source / ITEMS[2][0]))) == 39
    print(json.dumps({"articles_verified": len(output), "original_content_verification": output, "menu_and_index_verified": True, "source_images": 0}, ensure_ascii=False, indent=2))


def generate(source):
    paths = [DEST / f"{x[1]}.md" for x in ITEMS] + [DEST / "index.md", DEST / "meta.json"]
    assert not any(p.exists() for p in paths), "Refusing to overwrite existing archive files"
    for filename, slug, title, year, kind, note in ITEMS:
        body = source_body(source / filename)
        front = f'''---
title: {json.dumps(title, ensure_ascii=False)}
description: {json.dumps(year + "年李录" + kind + "，按用户提供的文字稿完整归档。", ensure_ascii=False)}
category: 公开演讲
updated: "2026-10-19"
tags: ["李录", "公开演讲", "{kind}"]
---

> 资料说明：本篇为用户提供的{kind}，原文件名为“{filename}”。保留原文、标题层级、问答、强调、来源链接和编者备注，仅整理行尾空白并将原始篇名放入页面标题。资料日期、场合与内容真实性未作外部核实，文中历史判断不代表当前情况。{note}

[返回公开演讲栏目](./index.md)
'''
        if slug == "2024-global-value-investing-transcript":
            front += "\n同题另一版本：[《全球价值投资与时代》PDF版全文及问答](../global-value-investing-and-the-times-2024.md)。\n"
        if slug == "2019-peking-value-investing-practice":
            front += "\n相关阅读：[《价值投资在中国的展望》2015年演讲全文](../value-investing-in-china-2015.md)。原文所带外部链接同时保留。\n"
        (DEST / f"{slug}.md").write_text(front + f"\n{START}\n\n" + body + f"\n\n{END}\n", encoding="utf-8")
    index = '''---
title: 李录公开演讲与访谈
description: 李录演讲、问答、访谈与讲座笔记的文字稿归档，按年份排列。
category: 公开演讲
updated: "2026-10-19"
tags: ["李录", "公开演讲", "问答", "访谈"]
---

本栏目收录本次提供的9篇李录文字稿，按年份排列。演讲、访谈和笔记按资料本身的类型标注，不将第三方笔记当作演讲逐字稿。原有PDF资料保留在原来的位置和网址。

> 以下内容按用户材料归档，未做外部真实性核验。原文中的日期、历史观点、来源和编者说明保留；2024年《全球价值投资与时代》与已收录PDF版作为两个资料版本分别保存。
'''
    prior = None
    for filename, slug, title, year, kind, note in ITEMS:
        if year != prior:
            index += f"\n## {year}\n"
            prior = year
        index += f"\n- [{title}](./{slug}.md) — {kind}。\n"
    index += '''
## 已收录的相关PDF资料

- [《价值投资在中国的展望》2015年演讲全文](../value-investing-in-china-2015.md)
- [《全球价值投资与时代》2024年PDF版全文及问答](../global-value-investing-and-the-times-2024.md)

[返回李录：核心思想与资料索引](../index.md)
'''
    (DEST / "index.md").write_text(index, encoding="utf-8")
    (DEST / "meta.json").write_text(json.dumps({"title": "公开演讲", "pages": ["index"] + [x[1] for x in ITEMS]}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    verify(source)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--source", type=Path, required=True)
    p.add_argument("--verify", action="store_true")
    args = p.parse_args()
    assert args.source.is_dir()
    assert set(x.name for x in args.source.glob("*.md")) == set(x[0] for x in ITEMS)
    verify(args.source) if args.verify else generate(args.source)


if __name__ == "__main__":
    main()
