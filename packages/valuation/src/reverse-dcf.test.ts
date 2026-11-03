import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateDcf, type DcfInput } from "./dcf";
import {
  calculateReverseDcf,
  type ReverseDcfInput,
  reverseDcfGrowthRange,
} from "./reverse-dcf";

const base: ReverseDcfInput = {
  price: 14,
  cashFlow: 10,
  years: 5,
  discountRate: 10,
  terminalGrowthRate: 2,
  cash: 20,
  debt: 30,
  shares: 10,
};
function forwardPrice(growthRate: number, overrides: Partial<DcfInput> = {}) {
  const forward = calculateDcf({ ...base, growthRate, ...overrides });
  assert.ok(forward.ok);
  return forward.value.valuePerShare;
}

test("反向DCF回代恢复正增速、零增速和负增速", () => {
  for (const growthRate of [-50, -5, 0, 5, 25, 90]) {
    const price = forwardPrice(growthRate, { cash: 0, debt: 0 });
    const result = calculateReverseDcf({ ...base, price, cash: 0, debt: 0 });
    assert.ok(result.ok);
    assert.ok(Math.abs(result.growthRate - growthRate) < 1e-7);
    assert.ok(Math.abs(result.priceDifference / price) < 1e-8);
    assert.equal(result.dcf.projections.length, base.years);
  }
});

test("股权市值正确反推企业价值，加回债务、扣除现金", () => {
  const result = calculateReverseDcf({ ...base, price: forwardPrice(5) });
  assert.ok(result.ok);
  assert.ok(Math.abs(result.growthRate - 5) < 1e-7);
  assert.equal(result.targetEquityValue, forwardPrice(5) * base.shares);
  assert.equal(
    result.targetEnterpriseValue,
    result.targetEquityValue - 20 + 30,
  );
});

test("一年期可用独立代数解核验", () => {
  const input = { ...base, years: 1, price: 12, cash: 0, debt: 0 };
  const expected =
    ((input.price * input.shares * 1.1) / (input.cashFlow * (1 + 1.02 / 0.08)) -
      1) *
    100;
  const result = calculateReverseDcf(input);
  assert.ok(result.ok);
  assert.ok(Math.abs(result.growthRate - expected) < 1e-7);
});

test("求解范围两个端点可以被回代恢复", () => {
  for (const growthRate of [
    reverseDcfGrowthRange.min,
    reverseDcfGrowthRange.max,
  ]) {
    const price = forwardPrice(growthRate, { cash: 0, debt: 0 });
    const result = calculateReverseDcf({ ...base, cash: 0, debt: 0, price });
    assert.ok(result.ok);
    assert.ok(Math.abs(result.growthRate - growthRate) < 1e-7);
  }
});

test("超出上下边界不以边界增长率冒充结果", () => {
  for (const [growthRate, multiple] of [
    [reverseDcfGrowthRange.min, 0.5],
    [100, 2],
  ]) {
    const price = forwardPrice(growthRate, { cash: 0, debt: 0 }) * multiple;
    const result = calculateReverseDcf({ ...base, cash: 0, debt: 0, price });
    assert.ok(!result.ok);
    assert.equal(result.code, "outside_range");
    assert.ok(result.priceRange);
  }
});

test("非正隐含企业价值无解，不偷偷返回极低增速", () => {
  for (const cash of [170, 200]) {
    const result = calculateReverseDcf({ ...base, cash });
    assert.ok(!result.ok);
    assert.equal(result.code, "outside_range");
  }
});

test("非法输入、空值、无穷大和折现率约束被拦截", () => {
  const cases: Partial<ReverseDcfInput>[] = [
    { price: 0 },
    { price: -1 },
    { shares: 0 },
    { cashFlow: -1 },
    { cash: -1 },
    { debt: -1 },
    { years: 0 },
    { years: 1.5 },
    { years: 31 },
    { discountRate: 0 },
    { terminalGrowthRate: 10 },
  ];
  for (const field of Object.keys(base) as (keyof ReverseDcfInput)[]) {
    cases.push({ [field]: Number.NaN }, { [field]: Infinity });
  }
  for (const invalid of cases) {
    const result = calculateReverseDcf({ ...base, ...invalid });
    assert.ok(!result.ok);
    assert.equal(result.code, "invalid_input");
    assert.ok(Object.keys(result.errors).length);
  }
});

test("固定其他假设时，较高股价要求较高增长率", () => {
  const lower = calculateReverseDcf({ ...base, price: 10 });
  const higher = calculateReverseDcf({ ...base, price: 20 });
  assert.ok(lower.ok && higher.ok);
  assert.ok(higher.growthRate > lower.growthRate);
});

test("金额及股数同倍缩放、极小金额保持结果一致", () => {
  for (const scale of [1e-10, 100, 1e6]) {
    const result = calculateReverseDcf({
      ...base,
      cashFlow: base.cashFlow * scale,
      cash: base.cash * scale,
      debt: base.debt * scale,
      shares: base.shares * scale,
      price: forwardPrice(5),
    });
    assert.ok(result.ok);
    assert.ok(Math.abs(result.growthRate - 5) < 1e-7);
  }
});

test("30年预测和不同终值假设均恢复增长率", () => {
  for (const terminalGrowthRate of [-2, 0, 2]) {
    const price = forwardPrice(3, { years: 30, terminalGrowthRate });
    const result = calculateReverseDcf({
      ...base,
      price,
      years: 30,
      terminalGrowthRate,
    });
    assert.ok(result.ok);
    assert.ok(Math.abs(result.growthRate - 3) < 1e-7);
  }
});

test("目标市值溢出及严重抵消导致精度不足时明确失败", () => {
  const overflow = calculateReverseDcf({ ...base, price: Number.MAX_VALUE });
  assert.ok(!overflow.ok);
  assert.equal(overflow.code, "numerical_error");
  const cancel = calculateReverseDcf({ ...base, price: 1e-16 });
  assert.ok(!cancel.ok);
  assert.equal(cancel.code, "numerical_error");
});
