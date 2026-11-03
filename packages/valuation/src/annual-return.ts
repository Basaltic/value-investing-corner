export type AnnualReturnInput = {
  buyPrice: number;
  baseEps: number;
  earningsGrowthRate: number;
  years: number;
  exitPe: number;
  payoutRatio: number;
};
export type AnnualReturnField = keyof AnnualReturnInput;
export type AnnualReturnProjection = {
  year: number;
  eps: number;
  dividend: number;
  saleProceeds: number;
  cashFlow: number;
};
export type AnnualReturnValue = {
  irr: number;
  priceCagr: number;
  entryPe: number;
  exitPrice: number;
  totalDividends: number;
  totalProceeds: number;
  totalProfit: number;
  totalReturn: number;
  multipleAnnualChange: number;
  projections: AnnualReturnProjection[];
  cashFlows: number[];
  relativeNpvError: number;
};
export type AnnualReturnResult =
  | { ok: true; value: AnnualReturnValue }
  | {
      ok: false;
      code: "invalid_input" | "numerical_error";
      errors: Partial<Record<AnnualReturnField, string>>;
      message: string;
    };

// Per-share cash flows: buy one share at t=0, dividends at each year end,
// then sell at the end of year N AFTER receiving that year's dividend.
// Dividends are neither reinvested nor assumed to earn interest.
export function calculateAnnualReturn(
  input: AnnualReturnInput,
): AnnualReturnResult {
  const errors: Partial<Record<AnnualReturnField, string>> = {};
  const fields: AnnualReturnField[] = [
    "buyPrice",
    "baseEps",
    "earningsGrowthRate",
    "years",
    "exitPe",
    "payoutRatio",
  ];
  for (const field of fields) {
    if (!Number.isFinite(input[field])) errors[field] = "请输入有效数字。";
  }
  if (!(input.buyPrice > 0)) errors.buyPrice = "买入价必须大于 0。";
  if (!(input.baseEps > 0))
    errors.baseEps = "基期 EPS 必须大于 0；本工具不适用于亏损企业。";
  if (!(input.earningsGrowthRate > -100 && input.earningsGrowthRate <= 100))
    errors.earningsGrowthRate = "年增速需大于 -100% 且不超过 100%。";
  if (!(Number.isInteger(input.years) && input.years >= 1 && input.years <= 30))
    errors.years = "持有年数需为 1 至 30 的整数。";
  if (!(input.exitPe > 0)) errors.exitPe = "退出市盈率必须大于 0。";
  if (!(input.payoutRatio >= 0 && input.payoutRatio <= 100))
    errors.payoutRatio = "分红支付率需为 0% 至 100%；不分红请明确填 0。";
  if (Object.keys(errors).length)
    return {
      ok: false,
      code: "invalid_input",
      errors,
      message: "请修正输入后再计算。",
    };
  const failure: AnnualReturnResult = {
    ok: false,
    code: "numerical_error",
    errors: {},
    message:
      "当前输入超出可靠数值范围或精度，无法完成年化收益校验。请检查金额、单位与增长假设。",
  };
  const growthFactor = 1 + input.earningsGrowthRate / 100;
  const payout = input.payoutRatio / 100;
  const finalEps = input.baseEps * growthFactor ** input.years;
  const exitPrice = finalEps * input.exitPe;
  const entryPe = input.buyPrice / input.baseEps;
  const projections = Array.from({ length: input.years }, (_, index) => {
    const year = index + 1;
    const eps = input.baseEps * growthFactor ** year;
    const dividend = eps * payout;
    const saleProceeds = year === input.years ? exitPrice : 0;
    return {
      year,
      eps,
      dividend,
      saleProceeds,
      cashFlow: dividend + saleProceeds,
    };
  });
  const totalDividends = projections.reduce(
    (sum, row) => sum + row.dividend,
    0,
  );
  const totalProceeds = exitPrice + totalDividends;
  const totalProfit = totalProceeds - input.buyPrice;
  const totalReturn = (totalProfit / input.buyPrice) * 100;
  const priceCagr =
    Math.expm1((Math.log(exitPrice) - Math.log(input.buyPrice)) / input.years) *
    100;
  const multipleAnnualChange =
    Math.expm1((Math.log(input.exitPe) - Math.log(entryPe)) / input.years) *
    100;
  if (
    !(exitPrice > 0 && entryPe > 0) ||
    ![
      exitPrice,
      entryPe,
      totalDividends,
      totalProceeds,
      totalProfit,
      totalReturn,
      priceCagr,
      multipleAnnualChange,
    ].every(Number.isFinite) ||
    projections.some(
      (row) => ![row.eps, row.dividend, row.cashFlow].every(Number.isFinite),
    )
  )
    return failure;

  // There is one negative outflow and only nonnegative inflows, so IRR is unique.
  // Search log(1+r), using log-sum-exp to avoid overflow near r=-100%.
  const terms = projections
    .filter((row) => row.cashFlow > 0)
    .map((row) => ({
      year: row.year,
      logRatio: Math.log(row.cashFlow) - Math.log(input.buyPrice),
    }));
  const logPresentValue = (logRate: number) => {
    const values = terms.map((term) => term.logRatio - term.year * logRate);
    const max = Math.max(...values);
    return (
      max +
      Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0))
    );
  };
  let low = -744;
  let high = 709;
  let logRate = 0;
  for (let iteration = 0; iteration < 160; iteration++) {
    logRate = low + (high - low) / 2;
    const logValue = logPresentValue(logRate);
    if (Math.abs(logValue) < 1e-12) break;
    if (logValue > 0) low = logRate;
    else high = logRate;
  }
  const rate = Math.expm1(logRate);
  const irr = rate * 100;
  // Validate the returned rate, not merely the internal search parameter.
  const relativeNpvError = Math.expm1(logPresentValue(Math.log1p(rate)));
  if (
    !(rate > -1) ||
    !Number.isFinite(irr) ||
    !Number.isFinite(relativeNpvError) ||
    Math.abs(relativeNpvError) > 1e-8
  )
    return failure;
  return {
    ok: true,
    value: {
      irr,
      priceCagr,
      entryPe,
      exitPrice,
      totalDividends,
      totalProceeds,
      totalProfit,
      totalReturn,
      multipleAnnualChange,
      projections,
      cashFlows: [-input.buyPrice, ...projections.map((row) => row.cashFlow)],
      relativeNpvError,
    },
  };
}
