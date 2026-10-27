import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardApi } from "./dashboard";

test("browser dashboard does not invoke native state or save", async () => {
  let calls = 0;
  const api = createDashboardApi(false, async () => {
    calls++;
    return null as never;
  });
  await assert.rejects(api.load());
  await assert.rejects(api.save({ groups: [], cards: [] }, 0));
  assert.equal(calls, 0);
});
test("dashboard commands only carry typed config, IDs and revision", async () => {
  const calls: { cmd: string; args: unknown }[] = [];
  const api = createDashboardApi(true, async (cmd, args) => {
    calls.push({ cmd, args });
    return null as never;
  });
  await api.save({ groups: [], cards: [] }, 2);
  await api.items("company");
  assert.deepEqual(calls, [
    {
      cmd: "dashboard_save",
      args: { config: { groups: [], cards: [] }, expectedRevision: 2 },
    },
    { cmd: "dashboard_items", args: { companyId: "company" } },
  ]);
});
