import assert from "node:assert/strict";
import test from "node:test";
import { createCollectionApi } from "./collection";

test("browser collection and credentials never call native", async () => {
  let calls = 0;
  const api = createCollectionApi(false, async () => {
    calls++;
    return null as never;
  });
  await assert.rejects(api.sources());
  await assert.rejects(api.secretSave("gnews", "test"));
  assert.equal(calls, 0);
});
test("collection inputs carry IDs and revisions, credential returns status only", async () => {
  const seen: { cmd: string; args: unknown }[] = [];
  const api = createCollectionApi(true, async (cmd, args) => {
    seen.push({ cmd, args });
    return { configured: true } as never;
  });
  await api.enqueue("c", "sec_finance", "request1");
  const status = await api.secretStatus("gnews");
  assert.deepEqual(status, { configured: true });
  assert.deepEqual(seen, [
    {
      cmd: "collection_enqueue",
      args: { companyId: "c", sourceId: "sec_finance", requestKey: "request1" },
    },
    { cmd: "collection_credential_status", args: { sourceId: "gnews" } },
  ]);
});
