import assert from "node:assert/strict";
import test from "node:test";
import {
  completeObservationContext,
  contextKey,
  emptyFact,
} from "./finance-meta";
import {
  buildSeries,
  latestVersions,
  parseOptionalNumber,
} from "./finance-series";

test("different quarter and cumulative spans never share a trend", () => {
  const q1 = {
    ...emptyFact,
    period_kind: "quarter",
    period_start: "2024-01-01",
    period_end: "2024-03-31",
  };
  const q2 = { ...q1, period_start: "2025-04-01", period_end: "2025-06-30" };
  assert.notEqual(contextKey(q1), contextKey(q2));
  assert.equal(
    contextKey(q1),
    contextKey({ ...q1, period_start: "2025-01-01", period_end: "2025-03-31" }),
  );
  assert.notEqual(
    contextKey({ ...q1, period_kind: "ytd" }),
    contextKey({ ...q2, period_kind: "ytd" }),
  );
});
test("custom numeric series with missing units or basis stays ineligible", () => {
  assert.equal(
    completeObservationContext({ unit: "", basis: "客户", currency: "" }),
    false,
  );
  assert.equal(
    completeObservationContext({ unit: "人", basis: "", currency: "" }),
    false,
  );
  assert.equal(
    completeObservationContext({ unit: "人", basis: "期末客户", currency: "" }),
    true,
  );
});

test("empty numeric input stays null and malformed/nonfinite input is rejected", () => {
  assert.equal(parseOptionalNumber(""), null);
  assert.equal(parseOptionalNumber("  "), null);
  assert.equal(parseOptionalNumber("0"), 0);
  assert.equal(parseOptionalNumber("-2.5"), -2.5);
  for (const s of ["NaN", "Infinity", "1,200", "1e999", "1e-999"])
    assert.throws(() => parseOptionalNumber(s));
});
test("latest unreviewed revision does not fallback to old reviewed values", () => {
  const rows = [
    {
      id: "a",
      series_id: "same",
      version: 1,
      date: "2025-01-01",
      value: 10,
      reviewed: true,
    },
    {
      id: "b",
      series_id: "same",
      version: 2,
      date: "2025-01-01",
      value: 20,
      reviewed: false,
    },
  ];
  assert.equal(latestVersions(rows)[0].id, "b");
  const s = buildSeries(latestVersions(rows), ["2025-01-01", "2025-02-01"]);
  assert.deepEqual(s.reviewed, [null, null]);
  assert.deepEqual(s.pending, [20, null]);
});
test("missing and duplicate observations make gaps while real zero survives", () => {
  const rows = [
    { date: "2025-01-01", value: 0, reviewed: true },
    { date: "2025-03-01", value: 12, reviewed: true },
    { date: "2025-03-01", value: 13, reviewed: true },
  ];
  const s = buildSeries(rows, ["2025-01-01", "2025-02-01", "2025-03-01"]);
  assert.deepEqual(s.reviewed, [0, null, null]);
  assert.deepEqual(s.pending, [null, null, null]);
});
