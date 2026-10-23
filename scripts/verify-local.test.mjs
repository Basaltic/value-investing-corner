import assert from "node:assert/strict";
import test from "node:test";
import { localEnvironment } from "./verify-local.mjs";

test("本地验证隔离所有 Algolia 凭据，不修改原环境", () => {
  const original = {
    ALGOLIA_WRITE_KEY: "private",
    NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "private",
    PATH: "/bin",
  };
  const safe = localEnvironment(original);
  assert.equal(safe.ALGOLIA_WRITE_KEY, "");
  assert.equal(safe.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY, "");
  assert.equal(safe.ALGOLIA_SKIP_SYNC, "true");
  assert.equal(safe.PATH, "/bin");
  assert.equal(original.ALGOLIA_WRITE_KEY, "private");
});
