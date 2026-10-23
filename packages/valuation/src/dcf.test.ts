import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDcf, type DcfField, type DcfInput } from "./dcf";

const base: DcfInput = {
  cashFlow: 10,
  growthRate: 5,
  years: 5,
  discountRate: 10,
  terminalGrowthRate: 2,
  cash: 20,
  debt: 30,
  shares: 10,
};
function near(actual: number, expected: number) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9 * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );
}

test("FCFF 年末折现、N+1 终值和股权桥接与独立计算一致", () => {
  const result = calculateDcf(base);
  assert.ok(result.ok);
  let discounted = 0;
  for (let t = 1; t <= 5; t++) discounted += (10 * 1.05 ** t) / 1.1 ** t;
  const terminal = (10 * 1.05 ** 5 * 1.02) / 0.08;
  near(result.value.projectedPresentValue, discounted);
  near(result.value.terminalValue, terminal);
  near(result.value.enterpriseValue, discounted + terminal / 1.1 ** 5);
  near(result.value.equityValue, result.value.enterpriseValue - 10);
  near(result.value.valuePerShare, result.value.equityValue / 10);
  near(
    result.value.terminalWeight,
    result.value.terminalPresentValue / result.value.enterpriseValue,
  );
  assert.equal(result.value.projections.length, 5);
  near(result.value.projections[0].cashFlow, 10.5);
});

test("零增长永续现金流现值恒为现金流除折现率，与预测年数无关", () => {
  for (const years of [1, 5, 30]) {
    const result = calculateDcf({
      ...base,
      years,
      growthRate: 0,
      terminalGrowthRate: 0,
      cash: 0,
      debt: 0,
    });
    assert.ok(result.ok);
    near(result.value.enterpriseValue, 100);
    near(result.value.valuePerShare, 10);
  }
});

test("单位同时缩放不改变每股估值，现金债务不改变企业价值", () => {
  const original = calculateDcf(base);
  const scaled = calculateDcf({
    ...base,
    cashFlow: 100,
    cash: 200,
    debt: 300,
    shares: 100,
  });
  const cash = calculateDcf({ ...base, cash: 120 });
  assert.ok(original.ok && scaled.ok && cash.ok);
  near(original.value.valuePerShare, scaled.value.valuePerShare);
  near(original.value.enterpriseValue, cash.value.enterpriseValue);
  near(cash.value.equityValue - original.value.equityValue, 100);
});

test("较高折现率降低估值；较高增长率提高估值", () => {
  const result = calculateDcf(base);
  const higherRate = calculateDcf({ ...base, discountRate: 12 });
  const higherGrowth = calculateDcf({ ...base, growthRate: 6 });
  assert.ok(result.ok && higherRate.ok && higherGrowth.ok);
  assert.ok(higherRate.value.enterpriseValue < result.value.enterpriseValue);
  assert.ok(higherGrowth.value.enterpriseValue > result.value.enterpriseValue);
});

test("负增速、负股权价值保留真实计算，不截断为零", () => {
  const result = calculateDcf({
    ...base,
    growthRate: -5,
    terminalGrowthRate: -2,
    debt: 1000,
  });
  assert.ok(result.ok);
  assert.ok(
    result.value.projections[1].cashFlow < result.value.projections[0].cashFlow,
  );
  assert.ok(result.value.equityValue < 0);
  assert.ok(result.value.valuePerShare < 0);
});

test("折现率等于或低于永续增速时阻止计算", () => {
  for (const terminalGrowthRate of [10, 11]) {
    const result = calculateDcf({ ...base, terminalGrowthRate });
    assert.ok(!result.ok);
    assert.ok(result.errors.terminalGrowthRate);
  }
});

test("空输入、非有限值及非法范围均返回字段错误", () => {
  const cases: [DcfField, number][] = [
    ["cashFlow", 0],
    ["cashFlow", -10],
    ["shares", 0],
    ["cash", -1],
    ["debt", -1],
    ["growthRate", -100],
    ["growthRate", 101],
    ["years", 0],
    ["years", 1.5],
    ["years", 31],
    ["discountRate", 0],
    ["discountRate", 101],
    ["terminalGrowthRate", -100],
  ];
  for (const field of Object.keys(base) as DcfField[]) {
    cases.push([field, Number.NaN], [field, Number.POSITIVE_INFINITY]);
  }
  for (const [field, invalid] of cases) {
    const result = calculateDcf({ ...base, [field]: invalid });
    assert.ok(!result.ok, `accepted invalid ${field}=${invalid}`);
    assert.ok(result.errors[field]);
  }
});

test("溢出被阻止，极小正现金流仍可计算", () => {
  const overflow = calculateDcf({ ...base, cashFlow: Number.MAX_VALUE });
  assert.ok(!overflow.ok);
  const tiny = calculateDcf({ ...base, cashFlow: 0.000001, cash: 0, debt: 0 });
  assert.ok(tiny.ok);
  assert.ok(tiny.value.enterpriseValue > 0);
});
