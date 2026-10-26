import assert from "node:assert/strict";
import test from "node:test";
import { type CompanyInput, createCompanyApi } from "./companies";

const input: CompanyInput = {
  name: "本地公司",
  market: "private",
  registration: "",
  listings: [],
};
test("浏览器预览不能调用建档命令", async () => {
  let calls = 0;
  const api = createCompanyApi(false, async () => {
    calls++;
    throw new Error("unexpected");
  });
  await assert.rejects(() => api.create(input, false), /Tauri/);
  await assert.rejects(() => api.list(""), /Tauri/);
  assert.equal(calls, 0);
});
test("建档与证券命令不携带路径或SQL并保留确认状态", async () => {
  const calls: [string, unknown][] = [];
  const api = createCompanyApi(
    true,
    async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return { kind: "needs_confirmation", warnings: [] } as T;
    },
  );
  assert.equal((await api.create(input, false)).kind, "needs_confirmation");
  await api.addListing(
    "id-1",
    { market: "us", code: "X", exchange: "", security_type: "ADR" },
    true,
  );
  assert.deepEqual(calls, [
    ["company_create", { input, confirmDuplicates: false }],
    [
      "listing_add",
      {
        companyId: "id-1",
        input: { market: "us", code: "X", exchange: "", security_type: "ADR" },
        confirmDuplicates: true,
      },
    ],
  ]);
});
