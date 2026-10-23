import * as fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toDocuments } from "fumadocs-core/search/algolia";
import { loader } from "fumadocs-core/source";
import { register } from "fumadocs-mdx/node";
import { knowledgeRoute } from "../lib/routes.mjs";
import { validateDocuments } from "./sync-content.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
register({
  configPath: "scripts/search-export.config.mjs",
  outDir: "build/search/.source",
  macro: { include: ["lib/content-collections.mjs"] },
});

try {
  const { knowledgeCollection } = await import(
    "../lib/content-collections.mjs"
  );
  const source = loader({
    baseUrl: knowledgeRoute,
    source: knowledgeCollection.toFumadocsSource(),
  });
  const documents = validateDocuments(await toDocuments(source));
  const filePath = path.join(root, "build/search/algolia-documents.json");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  // Exclusive temporary file + atomic replacement: never leave a partial export.
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(documents), { flag: "wx" });
  await fs.rename(temporary, filePath);
  console.log(`Algolia：已导出 ${documents.length} 篇文档到 ${filePath}。`);
} catch (error) {
  console.error(
    "Algolia 索引导出失败：",
    error instanceof Error ? error.message : "未知错误",
  );
  process.exitCode = 1;
}
