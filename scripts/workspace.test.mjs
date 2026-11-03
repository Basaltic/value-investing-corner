import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const json = async (file) =>
  JSON.parse(await readFile(new URL(file, root), "utf8"));

test("仅保留 Web 应用及其使用的 workspace 模块", async () => {
  const web = await json("apps/web/package.json");
  assert.equal(web.name, "@value-investing/web");
  for (const name of ["valuation", "content-schema", "content"]) {
    assert.equal(web.dependencies[`@value-investing/${name}`], "workspace:*");
  }
  await assert.rejects(access(new URL("apps/desktop/package.json", root)), {
    code: "ENOENT",
  });
  // README 属于保留的历史文档，目录中不应再有桌面程序。
  const desktop = await readdir(new URL("apps/desktop/", root)).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  assert.deepEqual(
    desktop.filter((name) => name !== "README.md"),
    [],
  );
  const workspace = await readFile(
    new URL("pnpm-workspace.yaml", root),
    "utf8",
  );
  assert.match(workspace, /"apps\/web"/);
  assert.doesNotMatch(workspace, /apps\/\*|desktop/);
  assert.match(workspace, /packages\/\*/);
});

test("根命令只启动和构建 Web，不再包含桌面命令", async () => {
  const pkg = await json("package.json");
  for (const command of ["dev", "dev:web", "build", "build:web", "start"]) {
    assert.match(pkg.scripts[command], /@value-investing\/web/);
  }
  assert.doesNotMatch(JSON.stringify(pkg), /desktop|tauri/i);
  assert.equal(pkg.dependencies, undefined);
});

test("锁文件不再保留桌面应用及其专属依赖", async () => {
  const lock = await readFile(new URL("pnpm-lock.yaml", root), "utf8");
  const obsolete = [
    "apps/desktop:",
    "@tauri-apps/",
    "@tiptap/",
    "@vitejs/plugin-react",
    "pdfjs-dist",
    "react-router-dom",
    "echarts@",
  ];
  for (const name of obsolete) {
    assert.equal(lock.includes(name), false, `锁文件仍包含 ${name}`);
  }
  assert.match(lock, /apps\/web:/);
});

test("Web 保留搜索构建、知识库内容和静态资料", async () => {
  const web = await json("apps/web/package.json");
  assert.match(web.scripts.build, /search:export.*next build.*search:sync/);
  await access(new URL("content/knowledge", root));
  await access(new URL("apps/web/public/materials", root));
});
