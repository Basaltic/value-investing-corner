import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { algoliasearch } from "algoliasearch";
import { sync } from "fumadocs-core/search/algolia";

export function getConfig(env) {
  const appId = env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? env.ALGOLIA_APP_ID;
  const searchKey =
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY ??
    env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY ??
    env.ALGOLIA_SEARCH_API_KEY;
  const writeKey = env.ALGOLIA_WRITE_KEY ?? env.ALGOLIA_WRITE_API_KEY;
  const indexName = env.ALGOLIA_INDEX_NAME ?? "document";
  if (![appId, searchKey, writeKey].some(Boolean)) return undefined;
  if (![appId, searchKey, writeKey, indexName].every((v) => v?.trim())) {
    throw new Error(
      "Algolia 配置不完整：需要应用 ID、只读搜索密钥、写入密钥和非空索引名称。",
    );
  }
  if (searchKey === writeKey) {
    throw new Error("搜索密钥不能与写入密钥相同，禁止向浏览器暴露写入密钥。");
  }
  return { appId, writeKey, indexName };
}

export function validateDocuments(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("搜索索引为空或格式错误，已阻止覆盖 Algolia 索引。");
  }
  const ids = new Set();
  const urls = new Set();
  for (const doc of value) {
    if (
      !doc ||
      typeof doc._id !== "string" ||
      !doc._id ||
      typeof doc.title !== "string" ||
      !doc.title.trim() ||
      typeof doc.url !== "string" ||
      !(doc.url === "/knowledge" || doc.url.startsWith("/knowledge/")) ||
      doc.url.startsWith("//") ||
      !Array.isArray(doc.structured?.headings) ||
      !Array.isArray(doc.structured?.contents)
    ) {
      throw new Error("搜索文档结构错误，已阻止覆盖 Algolia 索引。");
    }
    if (ids.has(doc._id) || urls.has(doc.url)) {
      throw new Error("搜索文档 ID 或 URL 重复，已阻止覆盖 Algolia 索引。");
    }
    ids.add(doc._id);
    urls.add(doc.url);
    if (
      doc.structured.headings.some(
        (h) => typeof h?.id !== "string" || typeof h?.content !== "string",
      ) ||
      doc.structured.contents.some(
        (p) =>
          typeof p?.content !== "string" ||
          (p.heading !== undefined && typeof p.heading !== "string"),
      )
    ) {
      throw new Error("搜索标题或段落结构错误，已阻止覆盖 Algolia 索引。");
    }
  }
  return value;
}

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function readDocuments({ root = projectRoot, indexFile } = {}) {
  // Next adapters may move prerenders before the build command returns.
  // An explicit path is authoritative; never silently fall back from it.
  const candidates = indexFile
    ? [indexFile]
    : [
        ".next/server/app/static.json.body",
        ".vercel/output/static/static.json",
        ".vercel/output/functions/static.json.prerender-fallback.body",
      ];
  const attempted = [];
  for (const candidate of candidates) {
    const filePath = path.resolve(root, candidate);
    attempted.push(filePath);
    let content;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    // A corrupt file is a build error, not a reason to sync an older fallback.
    const documents = validateDocuments(JSON.parse(content));
    return { documents, filePath };
  }
  throw new Error(
    `未找到本次构建的 static.json 搜索索引。已检查：\n${attempted.join("\n")}\n` +
      "请确认 app/static.json/route.ts 已提交并被预渲染；若适配器使用其他输出路径，请设置 ALGOLIA_INDEX_FILE。",
  );
}

export async function main() {
  const automatic = process.argv.includes("--auto");
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    const { documents, filePath } = await readDocuments({
      indexFile: process.env.ALGOLIA_INDEX_FILE,
    });
    console.log(
      `Algolia：索引校验通过，${documents.length} 篇文档，来源 ${filePath}；未执行远端写入。`,
    );
    return;
  }
  // Preview deployments must not replace the production search index.
  if (
    automatic &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.ALGOLIA_SYNC_PREVIEW !== "true"
  ) {
    console.log("Algolia：预览构建跳过同步；使用独立索引后可显式启用。");
    return;
  }
  const config = getConfig(process.env);
  if (!config) {
    if (!automatic) throw new Error("未配置 Algolia，请先设置环境变量。");
    console.log("Algolia：未配置，保留本地搜索，跳过索引同步。");
    return;
  }
  if (automatic && process.env.ALGOLIA_SKIP_SYNC === "true") {
    console.log("Algolia：本次构建已显式跳过索引同步。");
    return;
  }
  const { documents: records, filePath } = await readDocuments({
    indexFile: process.env.ALGOLIA_INDEX_FILE,
  });
  console.log(`Algolia：从 ${filePath} 读取 ${records.length} 篇文档。`);
  const client = algoliasearch(config.appId, config.writeKey);
  await sync(client, { indexName: config.indexName, documents: records });
  console.log(
    `Algolia：已同步 ${records.length} 篇文档到 ${config.indexName}。`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    // Never log SDK request objects or credentials.
    console.error(
      "Algolia 同步失败：",
      error instanceof Error ? error.message : "未知错误",
    );
    process.exitCode = 1;
  });
}
