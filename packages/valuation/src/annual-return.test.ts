import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type AnnualReturnField,
  type AnnualReturnInput,
  calculateAnnualReturn,
} from "./annual-return";

const base: AnnualReturnInput = {
  buyPrice: 20,
  baseEps: 1,
  earningsGrowthRate: 10,
  years: 5,
  exitPe: 20,
  payoutRatio: 30,
};
function near(actual: number, expected: number, tolerance = 1e-8) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );
}

test("无分红且PE不变时IRR与盈利增速和股价CAGR一致", () => {
  for (const earningsGrowthRate of [-50, -5, 0, 10, 100]) {
    const result = calculateAnnualReturn({
      ...base,
      earningsGrowthRate,
      payoutRatio: 0,
    });
    assert.ok(result.ok);
    near(result.value.irr, earningsGrowthRate);
    near(result.value.priceCagr, earningsGrowthRate);
    near(result.value.multipleAnnualChange, 0);
  }
});

test("一年期分红和出售只计一次，年化收益等于总回报", () => {
  const result = calculateAnnualReturn({
    ...base,
    years: 1,
    earningsGrowthRate: 0,
    payoutRatio: 100,
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value.cashFlows, [-20, 21]);
  near(result.value.irr, 5);
  near(result.value.totalReturn, 5);
});

test("恒定EPS、估值不变、每年付息式分红收益率可独立核验", () => {
  for (const years of [1, 5, 30]) {
    const result = calculateAnnualReturn({
      ...base,
      baseEps: 2,
      earningsGrowthRate: 0,
      exitPe: 10,
      payoutRatio: 50,
      years,
    });
    assert.ok(result.ok);
    near(result.value.irr, 5);
    near(result.value.priceCagr, 0);
    near(result.value.totalDividends, years);
  }
});

test("逐年EPS、分红、最后一年退出价和IRR回代独立核验", () => {
  const result = calculateAnnualReturn(base);
  assert.ok(result.ok);
  const v = result.value;
  const eps = Array.from({ length: 5 }, (_, i) => 1.1 ** (i + 1));
  const dividends = eps.map((value) => value * 0.3);
  near(v.exitPrice, eps[4] * 20);
  near(
    v.totalDividends,
    dividends.reduce((a, b) => a + b, 0),
  );
  near(v.totalProfit, v.exitPrice + v.totalDividends - 20);
  assert.equal(v.projections[0].saleProceeds, 0);
  near(v.projections[4].cashFlow, v.exitPrice + dividends[4]);
  const npv = v.cashFlows.reduce(
    (sum, cf, t) => sum + cf / (1 + v.irr / 100) ** t,
    0,
  );
  near(npv, 0);
  assert.ok(v.irr > v.priceCagr);
  assert.equal(v.cashFlows.length, 6);
});

test("盈利和PE对股价年化影响为乘法关系，不是简单相加", () => {
  const result = calculateAnnualReturn({ ...base, exitPe: 10 });
  assert.ok(result.ok);
  near(
    1 + result.value.priceCagr / 100,
    1.1 * (1 + result.value.multipleAnnualChange / 100),
  );
  near(result.value.entryPe, 20);
});

test("负收益被保留，不以零值截断", () => {
  const result = calculateAnnualReturn({
    ...base,
    earningsGrowthRate: -10,
    exitPe: 10,
  });
  assert.ok(result.ok);
  assert.ok(result.value.irr < 0);
  assert.ok(result.value.totalReturn < 0);
});

test("早到账分红的IRR不同于把分红全部挪到期末的CAGR", () => {
  const result = calculateAnnualReturn(base);
  assert.ok(result.ok);
  const terminalCagr =
    ((result.value.totalProceeds / base.buyPrice) ** (1 / base.years) - 1) *
    100;
  assert.ok(result.value.irr > terminalCagr);
});

test("不分红时退出PE提升提高年化回报", () => {
  const low = calculateAnnualReturn({ ...base, payoutRatio: 0, exitPe: 10 });
  const high = calculateAnnualReturn({ ...base, payoutRatio: 0, exitPe: 30 });
  assert.ok(low.ok && high.ok);
  assert.ok(high.value.irr > low.value.irr);
});

test("金额同倍缩放不改变IRR及回报率", () => {
  const original = calculateAnnualReturn(base);
  assert.ok(original.ok);
  for (const scale of [1e-10, 100, 1e12]) {
    const result = calculateAnnualReturn({
      ...base,
      buyPrice: base.buyPrice * scale,
      baseEps: base.baseEps * scale,
    });
    assert.ok(result.ok);
    near(result.value.irr, original.value.irr);
    near(result.value.totalReturn, original.value.totalReturn);
  }
});

test("非法范围及所有字段的空值/无穷大被拦截", () => {
  const cases: Partial<AnnualReturnInput>[] = [
    { buyPrice: 0 },
    { buyPrice: -1 },
    { baseEps: 0 },
    { baseEps: -1 },
    { years: 0 },
    { years: 31 },
    { years: 1.5 },
    { earningsGrowthRate: -100 },
    { earningsGrowthRate: 101 },
    { exitPe: 0 },
    { exitPe: -1 },
    { payoutRatio: -1 },
    { payoutRatio: 101 },
  ];
  for (const field of Object.keys(base) as AnnualReturnField[])
    cases.push({ [field]: NaN }, { [field]: Infinity });
  for (const invalid of cases) {
    const result = calculateAnnualReturn({ ...base, ...invalid });
    assert.ok(!result.ok);
    assert.equal(result.code, "invalid_input");
    assert.ok(Object.keys(result.errors).length);
  }
});

test("接近全损但仍可表示的负IRR可靠回代", () => {
  const result = calculateAnnualReturn({
    ...base,
    years: 1,
    earningsGrowthRate: -99.99,
    payoutRatio: 0,
  });
  assert.ok(result.ok);
  near(result.value.irr, -99.99);
  assert.ok(Math.abs(result.value.relativeNpvError) < 1e-8);
});

test("金额溢出或年化接近全损而精度不足时明确失败", () => {
  for (const input of [
    { ...base, baseEps: Number.MAX_VALUE },
    {
      ...base,
      buyPrice: Number.MAX_VALUE,
      years: 1,
      baseEps: 1e-10,
      payoutRatio: 0,
    },
  ]) {
    const result = calculateAnnualReturn(input);
    assert.ok(!result.ok);
    assert.equal(result.code, "numerical_error");
  }
});
