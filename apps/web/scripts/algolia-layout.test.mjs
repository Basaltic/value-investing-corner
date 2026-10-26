import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) =>
  readFile(new URL(`../${file}`, import.meta.url), "utf-8");

test("Algolia 页脚必须嵌套在弹窗内容中，关闭后不能泄漏到页面", async () => {
  const provider = await read("components/providers.tsx");
  assert.ok(
    !provider.includes('"fumadocs-ui/components/dialog/search-algolia"'),
  );
  const dialog = await read("components/algolia-search-dialog.tsx");
  assert.match(
    dialog,
    /<SearchDialogContent>[\s\S]*<SearchDialogFooter[\s\S]*<AlgoliaAttribution[\s\S]*<\/SearchDialogFooter>[\s\S]*<\/SearchDialogContent>/,
  );
});

test("页面标识只挂在首页末尾和知识库侧边栏 footer", async () => {
  const home = await read("app/(home)/layout.tsx");
  const knowledge = await read("app/knowledge/layout.tsx");
  assert.match(home, /\{children\}[\s\S]*<footer[\s\S]*<AlgoliaAttribution/);
  assert.match(
    knowledge,
    /sidebar=\{\{[\s\S]*footer:[\s\S]*<AlgoliaAttribution/,
  );
  const provider = await read("components/providers.tsx");
  assert.ok(!provider.includes("showAlgolia"));
});

test("标识保留可访问的 Algolia 链接和本地图标", async () => {
  const label = await read("components/algolia-attribution.tsx");
  assert.match(label, /href="https:\/\/algolia\.com"/);
  assert.match(label, /src="\/algolia\.svg"/);
  assert.match(label, /Search powered by Algolia/);
  assert.ok(!label.includes("ALGOLIA_WRITE"));
});
