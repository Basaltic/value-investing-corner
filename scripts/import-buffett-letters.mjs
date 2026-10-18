import { existsSync } from "node:fs";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [englishSource, chineseSource] = process.argv.slice(2);

if (!englishSource || !chineseSource) {
  console.error(
    "Usage: node scripts/import-buffett-letters.mjs <english-dir> <chinese-dir>",
  );
  process.exit(1);
}

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const targetRoot = path.join(
  projectRoot,
  "content/knowledge/masters/warren-buffett/letters",
);
const updated = "2026-10-18";

const specialTitles = {
  "1961_h": ["1961 年半年度致合伙人信", "1961 Semi-Annual Partnership Letter"],
  "1962_h": ["1962 年中期致合伙人信", "1962 Mid-Year Partnership Letter"],
  "1962_p": ["1962 年致 1963 年合伙人信", "1962 Letter to Partners for 1963"],
  "1963_h": ["1963 年半年度致合伙人信", "1963 Semi-Annual Partnership Letter"],
  "1963_p": ["1963 年致 1964 年合伙人信", "1963 Letter to Partners for 1964"],
  "1964_h": ["1964 年半年度致合伙人信", "1964 Semi-Annual Partnership Letter"],
  "1965_h": ["1965 年半年度致合伙人信", "1965 Semi-Annual Partnership Letter"],
  "1965_p": ["1965 年致 1966 年合伙人信", "1965 Letter to Partners for 1966"],
  "1966_h": ["1966 年半年度致合伙人信", "1966 Semi-Annual Partnership Letter"],
  "1967_h": ["1967 年半年度致合伙人信", "1967 Semi-Annual Partnership Letter"],
  "1967_p": ["1967 年投资目标调整信", "1967 Letter on Investment Objectives"],
  "1968_h": [
    "1969 年合伙基金过渡与安排说明",
    "1969 Partnership Transition Letter",
  ],
  "1969_m": ["1970 年免税债券专题信", "1970 Letter on Tax-Exempt Bonds"],
  "1969_m2": ["1968 年半年度致合伙人信", "1968 Semi-Annual Partnership Letter"],
  "1969_m3": ["1968 年度致合伙人信", "1968 Annual Partnership Letter"],
  "1970_m": [
    "1969 年投资目标调整说明",
    "1969 Letter on Changing Investment Objectives",
  ],
};

const languageConfig = {
  zh: {
    folderTitle: "中文译本",
    source: chineseSource,
    tag: "中文译本",
    counterpart: "原文对照",
    counterpartLabel: "English original",
  },
  en: {
    folderTitle: "English Originals",
    source: englishSource,
    tag: "English",
    counterpart: "中文译本",
    counterpartLabel: "Chinese translation",
  },
};

function decadeFor(year) {
  return `${Math.floor(Number(year) / 10) * 10}s`;
}

function decadeLabel(decade, language) {
  const start = decade.slice(0, 4);
  return language === "zh" ? `${start}年代` : decade;
}

function titleFor(filename, language) {
  const name = filename.replace(/\.md$/, "");
  const year = name.slice(0, 4);
  const special = specialTitles[name];

  if (special) return language === "zh" ? special[0] : special[1];

  if (language === "en") {
    return Number(year) < 1970
      ? `${year} Partnership Letter`
      : `${year} Shareholder Letter`;
  }

  return Number(year) < 1970 ? `${year} 年致合伙人信` : `${year} 年致股东信`;
}

function withFrontmatter({ title, description, tags, body }) {
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    'category: "股东信"',
    `updated: ${JSON.stringify(updated)}`,
    `tags: ${JSON.stringify(tags)}`,
    "---",
    "",
    body,
  ].join("\n");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeMarkdown(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
}

async function importReferencedImages(markdown, sourceDir, outputDir) {
  const imagePattern = /!\[([^\]]*)\]\((images\/[^)]+)\)/g;
  const replacements = [];

  for (const match of markdown.matchAll(imagePattern)) {
    const [fullMatch, , relativePath] = match;
    const sourcePath = path.join(sourceDir, relativePath);

    if (!existsSync(sourcePath)) {
      replacements.push({ fullMatch, replacement: "" });
      continue;
    }

    const outputPath = path.join(outputDir, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await copyFile(sourcePath, outputPath);
    replacements.push({ fullMatch, replacement: fullMatch });
  }

  return replacements
    .reduce(
      (content, { fullMatch, replacement }) =>
        content.replace(fullMatch, replacement),
      markdown,
    )
    .replace(/\n{3,}/g, "\n\n");
}

const catalog = {};

for (const [language, config] of Object.entries(languageConfig)) {
  if (!existsSync(config.source)) {
    throw new Error(`Source directory not found: ${config.source}`);
  }

  const files = (await readdir(config.source))
    .filter((filename) => filename.endsWith(".md"))
    .sort();

  const decades = new Map();

  for (const filename of files) {
    const year = filename.slice(0, 4);
    const decade = decadeFor(year);
    const title = titleFor(filename, language);
    const counterpartPath = `../../${language === "zh" ? "en" : "zh"}/${decade}/${filename}`;
    const original = await readFile(path.join(config.source, filename), "utf8");
    const outputDir = path.join(targetRoot, language, decade);
    const content = await importReferencedImages(
      original.trimStart(),
      config.source,
      outputDir,
    );
    const body = `> ${config.counterpart}：[${config.counterpartLabel}](${counterpartPath})\n\n${content}`;

    const output = withFrontmatter({
      title,
      description: `沃伦·巴菲特 ${title}，收录原始 Markdown 正文。`,
      tags: ["沃伦·巴菲特", "股东信", config.tag],
      body,
    });

    await writeMarkdown(path.join(outputDir, filename), output);

    if (!decades.has(decade)) decades.set(decade, []);
    decades.get(decade).push({ filename, title });
  }

  catalog[language] = {
    count: files.length,
    decades: [...decades.entries()],
  };

  const sortedDecades = [...decades.keys()].sort();

  await writeJson(path.join(targetRoot, language, "meta.json"), {
    title: config.folderTitle,
    pages: ["index", ...sortedDecades],
  });

  for (const decade of sortedDecades) {
    await writeJson(path.join(targetRoot, language, decade, "meta.json"), {
      title: decadeLabel(decade, language),
      pages: decades
        .get(decade)
        .map(({ filename }) => filename.replace(/\.md$/, "")),
    });
  }

  const sections = sortedDecades
    .map((decade) => {
      const rows = decades
        .get(decade)
        .map(
          ({ filename, title }) =>
            `| ${filename.slice(0, 4)} | [${title}](./${decade}/${filename}) |`,
        )
        .join("\n");

      return `## ${decadeLabel(decade, language)}\n\n| 年份 | 信函 |\n| --- | --- |\n${rows}`;
    })
    .join("\n\n");

  const indexTitle =
    language === "zh"
      ? "巴菲特股东信：中文译本"
      : "Buffett Letters: English Originals";
  const intro =
    language === "zh"
      ? `共收录 ${files.length} 份中文资料，覆盖 1957—2024 年。部分年份包含半年度信、专题信或合伙基金安排说明。`
      : `A total of ${files.length} English documents covering 1957–2024, including semi-annual letters, special topics, and partnership notices.`;

  await writeMarkdown(
    path.join(targetRoot, language, "index.md"),
    withFrontmatter({
      title: indexTitle,
      description:
        language === "zh"
          ? "沃伦·巴菲特历年致合伙人及股东信中文译本。"
          : "Original English letters from Warren Buffett to partners and shareholders.",
      tags: ["沃伦·巴菲特", "股东信", config.tag],
      body: `${intro}\n\n每封信顶部提供对应语言版本的链接，也可以从侧边栏按年代浏览。\n\n${sections}`,
    }),
  );
}

await writeJson(path.join(targetRoot, "meta.json"), {
  title: "股东信",
  pages: ["index", "zh", "en"],
});

await writeMarkdown(
  path.join(targetRoot, "index.md"),
  withFrontmatter({
    title: "巴菲特股东信",
    description: "沃伦·巴菲特 1957—2024 年致合伙人及股东信，中英文对照阅读。",
    tags: ["沃伦·巴菲特", "股东信", "英文原文", "中文译本"],
    body: [
      "这里收录沃伦·巴菲特历年致合伙人和伯克希尔·哈撒韦股东的信件，并提供中文译本与英文原文两个阅读入口。",
      "",
      "## 选择版本",
      "",
      `- [中文译本](./zh/index.md)：${catalog.zh.count} 份`,
      `- [English Originals](./en/index.md)：${catalog.en.count} 份`,
      "",
      "两种语言版本按年代组织。每封信顶部可以跳转到对应语言的同一封资料。",
      "",
      "## 阅读建议",
      "",
      "- 先结合年份，理解当时的市场、利率与伯克希尔业务结构。",
      "- 不只看结论，注意巴菲特如何提出假设、选择证据和承认错误。",
      "- 按主题回读，例如护城河、资本配置、保险浮存金、回购与机会成本。",
      "",
      "> 文件由用户提供的 Markdown 资料导入，并保留原始正文。",
    ].join("\n"),
  }),
);

await writeMarkdown(
  path.join(projectRoot, "content/knowledge/masters/warren-buffett/meta.json"),
  `${JSON.stringify(
    {
      title: "沃伦·巴菲特",
      pages: ["index", "letters", "materials"],
    },
    null,
    2,
  )}\n`,
);

console.log(
  `Imported ${catalog.zh.count} Chinese and ${catalog.en.count} English letters.`,
);
