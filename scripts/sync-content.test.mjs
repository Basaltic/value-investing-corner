import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { sync } from "fumadocs-core/search/algolia";
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
