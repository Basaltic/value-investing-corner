import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { sync } from "fumadocs-core/search/algolia";
import * as syncContent from "./sync-content.mjs";
import { getConfig, validateDocuments } from "./sync-content.mjs";

const env = {
  ALGOLIA_APP_ID: "test-app",
  ALGOLIA_SEARCH_API_KEY: "search-only",
  ALGOLIA_WRITE_API_KEY: "write-only",
};
const document = {
  _id: "/knowledge/test",
  title: "测试文档",
  url: "/knowledge/test",
  structured: {
    headings: [{ id: "section", content: "章节" }],
    contents: [{ heading: "section", content: "价值投资" }],
  },
};

async function artifactFixture(t, files) {
  const root = await fs.mkdtemp(path.join(tmpdir(), "algolia-artifact-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(contents));
  }
  return root;
}

test("构建显式生成独立索引，不依赖 Next 内部产物", async (t) => {
  const pkg = JSON.parse(await fs.readFile("package.json", "utf-8"));
  assert.match(pkg.scripts.build, /search:export.*next build.*search:sync/);
  const root = await artifactFixture(t, {
    "build/search/algolia-documents.json": [document],
  });
  const result = await syncContent.readDocuments({ root });
  assert.deepEqual(result.documents, [document]);
  assert.equal(
    result.filePath,
    path.join(root, "build/search/algolia-documents.json"),
  );
});

test("独立索引异常不能回退到旧平台文件", async (t) => {
  const root = await artifactFixture(t, {
    "build/search/algolia-documents.json": [],
    ".next/server/app/static.json.body": [document],
  });
  await assert.rejects(syncContent.readDocuments({ root }), /索引为空/);
});

test("全新CI目录无Next产物和环境文件也能导出并校验", async (t) => {
  const repository = await artifactFixture(t, {});
  const root = path.join(repository, "apps/web");
  await fs.mkdir(root, { recursive: true });
  for (const name of ["lib", "scripts", "public"]) {
    await fs.cp(path.resolve(name), path.join(root, name), { recursive: true });
  }
  await fs.cp(path.resolve("../../content"), path.join(repository, "content"), {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes("node_modules"),
  });
  await fs.symlink(
    path.resolve("../../content/node_modules"),
    path.join(repository, "content/node_modules"),
    "dir",
  );
  await fs.copyFile("package.json", path.join(root, "package.json"));
  await fs.symlink(
    path.resolve("node_modules"),
    path.join(root, "node_modules"),
    "dir",
  );
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.includes("ALGOLIA")),
  );
  const exported = spawnSync(process.execPath, ["scripts/export-search.mjs"], {
    cwd: root,
    env: cleanEnv,
    encoding: "utf-8",
    timeout: 120000,
  });
  assert.equal(exported.status, 0, exported.stderr);
  for (const name of [".next", ".vercel", ".env.local"]) {
    await assert.rejects(fs.access(path.join(root, name)), { code: "ENOENT" });
  }
  const result = await syncContent.readDocuments({ root });
  assert.ok(result.documents.length > 0);
  assert.match(result.filePath, /algolia-documents\.json$/);
  const checked = spawnSync(
    process.execPath,
    [
      "--env-file-if-exists=.env.local",
      "scripts/sync-content.mjs",
      "--dry-run",
    ],
    { cwd: root, env: cleanEnv, encoding: "utf-8" },
  );
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /未执行远端写入/);
});

test("读取本地 Next.js 索引，不依赖进程工作目录", async (t) => {
  const root = await artifactFixture(t, {
    ".next/server/app/static.json.body": [document],
  });
  assert.equal(typeof syncContent.readDocuments, "function");
  const result = await syncContent.readDocuments({ root });
  assert.deepEqual(result.documents, [document]);
  assert.equal(
    result.filePath,
    path.join(root, ".next/server/app/static.json.body"),
  );
});

test("Next 内部产物缺失时读取 Vercel 静态输出", async (t) => {
  const root = await artifactFixture(t, {
    ".vercel/output/static/static.json": [document],
  });
  assert.equal(typeof syncContent.readDocuments, "function");
  const result = await syncContent.readDocuments({ root });
  assert.deepEqual(result.documents, [document]);
  assert.match(result.filePath, /static[\\/]static\.json$/);
});

test("支持 Vercel prerender body 和自定义索引文件", async (t) => {
  assert.equal(typeof syncContent.readDocuments, "function");
  for (const file of [
    ".vercel/output/functions/static.json.prerender-fallback.body",
    "custom-search-export.json",
  ]) {
    const root = await artifactFixture(t, { [file]: [document] });
    const result = await syncContent.readDocuments({
      root,
      indexFile: file === "custom-search-export.json" ? file : undefined,
    });
    assert.deepEqual(result.documents, [document]);
  }
});

test("索引不存在时诊断所有路径，不能静默跳过", async (t) => {
  const root = await artifactFixture(t, {});
  assert.equal(typeof syncContent.readDocuments, "function");
  await assert.rejects(
    syncContent.readDocuments({ root }),
    /未找到.*static\.json.*\.vercel/s,
  );
});

test("损坏的本地产物不能被旧 Vercel 文件掩盖", async (t) => {
  const root = await artifactFixture(t, {
    ".next/server/app/static.json.body": [],
    ".vercel/output/static/static.json": [document],
  });
  assert.equal(typeof syncContent.readDocuments, "function");
  await assert.rejects(syncContent.readDocuments({ root }), /索引为空/);
});

test("显式索引路径错误时不读取默认产物", async (t) => {
  const root = await artifactFixture(t, {
    ".next/server/app/static.json.body": [document],
  });
  assert.equal(typeof syncContent.readDocuments, "function");
  await assert.rejects(
    syncContent.readDocuments({ root, indexFile: "missing.json" }),
    /未找到.*missing\.json/s,
  );
});

test("dry-run 在其他工作目录也能验证索引且不使用密钥", async (t) => {
  const root = await artifactFixture(t, { "index.json": [document] });
  const result = spawnSync(
    process.execPath,
    [path.resolve("scripts/sync-content.mjs"), "--dry-run"],
    {
      cwd: root,
      env: {
        ...process.env,
        ALGOLIA_INDEX_FILE: path.join(root, "index.json"),
        ALGOLIA_SEARCH_API_KEY: "same",
        ALGOLIA_WRITE_API_KEY: "same",
      },
      encoding: "utf-8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1 篇文档.*未执行远端写入/);
});

test("兼容现有变量名，默认 document 索引", () => {
  assert.deepEqual(getConfig(env), {
    appId: "test-app",
    writeKey: "write-only",
    indexName: "document",
  });
});

test("文档变量名优先且支持独立索引", () => {
  assert.deepEqual(
    getConfig({
      ...env,
      NEXT_PUBLIC_ALGOLIA_APP_ID: "new-app",
      NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: "new-search",
      ALGOLIA_WRITE_KEY: "new-write",
      ALGOLIA_INDEX_NAME: "preview-document",
    }),
    {
      appId: "new-app",
      writeKey: "new-write",
      indexName: "preview-document",
    },
  );
});

test("新的公开搜索变量优先于旧别名", () => {
  assert.throws(
    () =>
      getConfig({
        ...env,
        NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "write-only",
        NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: "old-search",
      }),
    /禁止向浏览器暴露/,
  );
});

test("Next.js 配置只映射两项安全凭据，写入密钥不公开", () => {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.includes("ALGOLIA")),
  );
  const script =
    'import config from "./next.config.mjs"; console.log(JSON.stringify(config.env));';
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      env: { ...cleanEnv, ...env },
      encoding: "utf-8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), {
    NEXT_PUBLIC_ALGOLIA_APP_ID: "test-app",
    NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "search-only",
  });
  assert.equal(result.stdout.includes("write-only"), false);

  const unsafe = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      env: { ...cleanEnv, ...env, ALGOLIA_SEARCH_API_KEY: "write-only" },
      encoding: "utf-8",
    },
  );
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /搜索密钥不能与写入密钥相同/);
});

test("没有凭据可回退，部分配置不能静默跳过", () => {
  assert.equal(getConfig({}), undefined);
  for (const name of Object.keys(env)) {
    assert.throws(() => getConfig({ ...env, [name]: "" }), /配置不完整/);
  }
  assert.throws(
    () => getConfig({ ...env, ALGOLIA_INDEX_NAME: " " }),
    /配置不完整/,
  );
});

test("搜索密钥不得与写入密钥相同", () => {
  assert.throws(
    () => getConfig({ ...env, ALGOLIA_SEARCH_API_KEY: "write-only" }),
    /禁止向浏览器暴露/,
  );
});

test("有效文档保持原始段落与锚点", () => {
  assert.deepEqual(validateDocuments([document]), [document]);
});

test("拒绝空索引、重复 ID 和 URL", () => {
  assert.throws(() => validateDocuments([]), /索引为空/);
  assert.throws(() => validateDocuments({}), /格式错误/);
  assert.throws(() => validateDocuments([document, document]), /重复/);
  assert.throws(
    () => validateDocuments([document, { ...document, _id: "other" }]),
    /重复/,
  );
});

test("拒绝异常结构、非站内链接及损坏段落", () => {
  for (const invalid of [
    null,
    { ...document, url: "https://example.com" },
    { ...document, url: "/knowledge-other" },
    { ...document, url: "//example.com" },
    { ...document, title: " " },
    { ...document, structured: {} },
    { ...document, structured: { headings: [null], contents: [] } },
    { ...document, structured: { headings: [], contents: [null] } },
  ]) {
    assert.throws(() => validateDocuments([invalid]), /结构错误/);
  }
});

test("Fumadocs 同步正确转换标题、段落和章节字段", async () => {
  let settings;
  let replacement;
  await sync(
    {
      async setSettings(value) {
        settings = value;
      },
      async replaceAllObjects(value) {
        replacement = value;
      },
    },
    { indexName: "test-document", documents: [document] },
  );
  assert.equal(settings.indexName, "test-document");
  assert.deepEqual(settings.indexSettings.searchableAttributes, [
    "title",
    "section",
    "content",
  ]);
  assert.equal(replacement.indexName, "test-document");
  assert.equal(replacement.objects.length, 2);
  assert.equal(replacement.objects[1].content, "价值投资");
  assert.equal(replacement.objects[1].section_id, "section");
  assert.equal(replacement.objects[1].url, document.url);
});

test("预览构建默认跳过远端写入，无配置构建可运行", () => {
  const cleanEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.includes("ALGOLIA")),
  );
  for (const VERCEL_ENV of ["preview", "production"]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/sync-content.mjs", "--auto"],
      { env: { ...cleanEnv, VERCEL_ENV }, encoding: "utf-8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /跳过/);
  }
});
