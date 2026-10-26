import assert from "node:assert/strict";
import test from "node:test";
import { createMaterialApi } from "./materials";

const input = { title: "资料", body: "正文", url: "", tags: ["标签"] };
test("browser material access never invokes native commands", async () => {
  let calls = 0;
  const api = createMaterialApi(false, async <T>() => {
    calls++;
    return {} as T;
  });
  await assert.rejects(api.list("company", "", false), /桌面/);
  await assert.rejects(api.create("company", "note", input), /桌面/);
  await assert.rejects(api.importFile("company", "copy", input), /桌面/);
  await assert.rejects(api.preview("material"), /桌面/);
  assert.equal(calls, 0);
});
test("file operations use IDs and native pickers, never paths or SQL", async () => {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const api = createMaterialApi(
    true,
    async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push({ command, args });
      return null as T;
    },
  );
  await api.importFile("company", "copy", input);
  await api.preview("material");
  await api.relocate("material");
  await api.reveal("material");
  assert.deepEqual(
    calls.map((c) => c.command),
    [
      "material_import_file",
      "material_preview",
      "material_relocate",
      "material_reveal",
    ],
  );
  assert.deepEqual(calls[1].args, { id: "material" });
  assert.deepEqual(calls[2].args, { id: "material" });
  assert(!JSON.stringify(calls).match(/database|sourcePath|sql/i));
});
test("mapping and archive arguments match native contract", async () => {
  const calls: Record<string, unknown>[] = [];
  const api = createMaterialApi(
    true,
    async <T>(_cmd: string, args?: Record<string, unknown>) => {
      calls.push(args ?? {});
      return {} as T;
    },
  );
  await api.mapping("id", ["名称", ""]);
  await api.archive("id", true);
  await api.update("id", input);
  assert.deepEqual(calls, [
    { id: "id", mapping: ["名称", ""] },
    { id: "id", archived: true },
    { id: "id", input },
  ]);
});
