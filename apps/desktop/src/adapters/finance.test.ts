import assert from "node:assert/strict";
import test from "node:test";
import { createFinanceApi, type FactInput } from "./finance";

test("browser finance rejects calls without native invoke", async () => {
  let calls = 0;
  const api = createFinanceApi(false, async () => {
    calls++;
    throw new Error("unexpected");
  });
  await assert.rejects(api.state("company"));
  assert.equal(calls, 0);
});
test("finance IPC carries only IDs and typed input, not SQL or paths", async () => {
  const calls: { cmd: string; args: unknown }[] = [];
  const api = createFinanceApi(
    true,
    async <T>(cmd: string, args?: Record<string, unknown>) => {
      calls.push({ cmd, args });
      return null as T;
    },
  );
  const input: FactInput = {
    metric: "revenue",
    value: null,
    currency: "",
    unit: "",
    period_kind: "annual",
    period_start: "2025-01-01",
    period_end: "2025-12-31",
    standard: "",
    scope: "",
    basis: "",
    source: "",
    tags: [],
    reviewed: false,
  };
  await api.saveFact("company", input, null);
  assert.deepEqual(calls, [
    {
      cmd: "finance_save_fact",
      args: { companyId: "company", input, baseId: null },
    },
  ]);
});
