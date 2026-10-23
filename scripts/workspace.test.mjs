import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const json = async (file) =>
  JSON.parse(await readFile(new URL(file, root), "utf8"));

test("Web 与桌面端是独立 workspace 应用", async () => {
  const web = await json("apps/web/package.json");
  const desktop = await json("apps/desktop/package.json");
  assert.equal(web.name, "@value-investing/web");
  assert.equal(desktop.name, "@value-investing/desktop");
  assert.equal(web.dependencies["@value-investing/valuation"], "workspace:*");
  assert.equal(
    desktop.dependencies["@value-investing/valuation"],
    "workspace:*",
  );
  assert.equal(
    web.dependencies["@value-investing/content-schema"],
    "workspace:*",
  );
  assert.equal(
    desktop.dependencies["@value-investing/content-schema"],
    "workspace:*",
  );
  assert.equal(desktop.dependencies.next, undefined);
  const workspace = await readFile(
    new URL("pnpm-workspace.yaml", root),
    "utf8",
  );
  assert.match(workspace, /apps\/\*/);
  assert.match(workspace, /packages\/\*/);
});

test("网站保留独立搜索构建而桌面不触发远端同步", async () => {
  const web = await json("apps/web/package.json");
  const desktop = await json("apps/desktop/package.json");
  const pkg = await json("package.json");
  assert.match(web.scripts.build, /search:export.*next build.*search:sync/);
  assert.doesNotMatch(desktop.scripts.build, /search:sync|next build/);
  assert.match(pkg.scripts.build, /@value-investing\/web/);
  assert.equal(pkg.dependencies, undefined);
  await access(new URL("content/knowledge", root));
  await access(new URL("apps/web/public/materials", root));
  await access(new URL("apps/desktop/src-tauri/Cargo.toml", root));
});
