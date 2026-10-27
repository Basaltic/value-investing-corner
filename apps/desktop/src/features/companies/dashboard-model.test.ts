import assert from "node:assert/strict";
import test from "node:test";
import type { FinanceState } from "../../adapters/finance";
import { groupedCompanies, metricChoices, metricView } from "./dashboard-model";
import { emptyFact } from "./finance-meta";

const f = (
  id: string,
  date: string,
  value: number | null,
  reviewed = true,
) => ({
  id,
  company_id: "c",
  series_id: id,
  version: 1,
  created_at: "",
  input: {
    ...emptyFact,
    metric: "revenue",
    value,
    currency: "CNY",
    unit: "元",
    standard: "CAS",
    scope: "合并",
    basis: "测试",
    period_start: `${date.slice(0, 4)}-01-01`,
    period_end: date,
    reviewed,
  },
});
const data: FinanceState = {
  facts: [
    f("a", "2023-12-31", 100),
    f("b", "2024-12-31", null, false),
    f("c", "2025-12-31", 140),
  ],
  definitions: [
    {
      id: "text",
      company_id: "c",
      input: {
        name: "观察",
        value_type: "text",
        unit: "",
        currency: "",
        basis: "个人",
      },
    },
  ],
  observations: [
    {
      id: "obs",
      company_id: "c",
      series_id: "obs",
      version: 1,
      created_at: "",
      input: {
        definition_id: "text",
        date: "2025-12-31",
        numeric_value: null,
        text_value: "测试文字",
        reviewed: true,
        source: "测试",
        tags: [],
      },
    },
  ],
  derived: [],
  derived_history: [],
};
test("metric card keeps null periods and text never becomes numeric", () => {
  const choices = metricChoices(data);
  const v = metricView(
    data,
    { kind: "fact", metric: "revenue", anchor_id: "a" },
    "",
    "",
  );
  assert.deepEqual(v.reviewed, [100, null, 140]);
  assert.equal(
    choices.filter(
      (c) => c.selection.kind === "fact" && c.selection.metric === "revenue",
    ).length,
    1,
  );
  const text = metricView(
    data,
    { kind: "custom", metric: "text", anchor_id: "text" },
    "",
    "",
  );
  assert.equal(text.type, "text");
  assert.deepEqual(text.reviewed, []);
  assert.equal(text.texts[0].value, "测试文字");
});
test("deleted or missing references yield an explicit empty card", () => {
  assert.equal(
    metricView(
      data,
      { kind: "custom", metric: "missing", anchor_id: "missing" },
      "",
      "",
    ).type,
    "empty",
  );
});
test("selected fact keeps latest pending revision and date range without filling zero", () => {
  const old = data.facts[0];
  const changed = {
    ...old,
    id: "new",
    version: 2,
    input: { ...old.input, value: 200, reviewed: false },
  };
  const state = { ...data, facts: [...data.facts, changed] };
  const v = metricView(
    state,
    { kind: "fact", metric: "revenue", anchor_id: "a" },
    "2023-01-01",
    "2024-12-31",
  );
  assert.deepEqual(v.reviewed, [null, null]);
  assert.deepEqual(v.pending, [200, null]);
});
test("custom missing units and duplicate date retain gaps", () => {
  const def = {
    id: "num",
    company_id: "c",
    input: {
      name: "客户",
      value_type: "number" as const,
      unit: "",
      currency: "",
      basis: "期末",
    },
  };
  const state = {
    ...data,
    definitions: [def],
    observations: [
      {
        ...data.observations[0],
        input: {
          ...data.observations[0].input,
          definition_id: "num",
          numeric_value: 0,
          text_value: null,
        },
      },
    ],
  };
  const v = metricView(
    state,
    { kind: "custom", metric: "num", anchor_id: "num" },
    "",
    "",
  );
  assert.deepEqual(v.reviewed, [null]);
  assert.match(v.issue, /单位/);
});
test("group order persists and ungrouped companies remain visible", () => {
  const companies = [
    { id: "c", name: "公司" },
    { id: "new", name: "新公司" },
  ];
  const grouped = groupedCompanies(companies, [
    { id: "g", name: "关注", company_ids: ["c"] },
  ]);
  assert.deepEqual(
    grouped.map((g) => g.companies.map((c) => c.id)),
    [["c"], ["new"]],
  );
});
