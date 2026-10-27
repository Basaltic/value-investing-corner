import assert from "node:assert/strict";
import test from "node:test";
import { createJudgmentApi } from "./judgments";

test("browser judgment adapter rejects reads and writes without invoking", async () => {
  let called = 0;
  const api = createJudgmentApi(false, async <T>() => {
    called++;
    return null as T;
  });
  await assert.rejects(api.state("c"), /桌面/);
  await assert.rejects(
    api.save("d", 0, { document: { type: "doc" }, reason: "" }),
    /桌面/,
  );
  assert.equal(called, 0);
});
test("judgment save, freeze and revisions carry IDs and revision but no paths", async () => {
  const calls: object[] = [];
  const api = createJudgmentApi(
    true,
    async <T>(cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      return null as T;
    },
  );
  await api.start("c", "v1");
  await api.freeze("d", 2);
  await api.save("d", 2, { document: { type: "doc" }, reason: "" });
  assert.deepEqual(calls.slice(0, 2), [
    { cmd: "judgment_start", args: { companyId: "c", baseId: "v1" } },
    { cmd: "judgment_freeze", args: { id: "d", expectedRevision: 2 } },
  ]);
  assert(!JSON.stringify(calls).includes("database"));
});
