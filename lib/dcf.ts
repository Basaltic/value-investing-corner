export type DcfInput = {
  cashFlow: number;
  growthRate: number;
  years: number;
  discountRate: number;
  terminalGrowthRate: number;
  cash: number;
  debt: number;
  shares: number;
};

export type DcfField = keyof DcfInput;
export type DcfErrors = Partial<Record<DcfField, string>>;
export type DcfProjection = {
  year: number;
  cashFlow: number;
  discountFactor: number;
  presentValue: number;
};
export type DcfValue = {
  projections: DcfProjection[];
  projectedPresentValue: number;
  terminalCashFlow: number;
  terminalValue: number;
  terminalPresentValue: number;
  enterpriseValue: number;
  equityValue: number;
  valuePerShare: number;
  terminalWeight: number;
};
export type DcfResult =
  | { ok: true; value: DcfValue }
  | { ok: false; errors: DcfErrors };

// All money amounts are in 100 million currency units; shares in 100 million.
// Rates enter as percentage points (10 means 10%). Cash flows arrive at year end.
export function calculateDcf(input: DcfInput): DcfResult {
  const errors: DcfErrors = {};
  for (const field of Object.keys(input) as DcfField[]) {
    if (!Number.isFinite(input[field])) errors[field] = "请输入有效数字。";
  }
  if (!(input.cashFlow > 0))
    errors.cashFlow = "FCFF 必须大于 0；本模型不适用于负现金流企业。";
  if (!(input.growthRate > -100 && input.growthRate <= 100))
    errors.growthRate = "增长率需大于 -100% 且不超过 100%。";
  if (!(Number.isInteger(input.years) && input.years >= 1 && input.years <= 30))
    errors.years = "预测年数需为 1 至 30 的整数。";
  if (!(input.discountRate > 0 && input.discountRate <= 100))
    errors.discountRate = "折现率需大于 0% 且不超过 100%。";
  if (!(input.terminalGrowthRate > -100 && input.terminalGrowthRate <= 100))
    errors.terminalGrowthRate = "永续增长率需大于 -100% 且不超过 100%。";
  if (input.terminalGrowthRate >= input.discountRate)
    errors.terminalGrowthRate = "永续增长率必须小于折现率，否则无法计算终值。";
  for (const field of ["cash", "debt"] as const) {
    if (!(input[field] >= 0))
      errors[field] = "请输入非负金额；无此项请明确填 0。";
  }
  if (!(input.shares > 0)) errors.shares = "总股数必须大于 0。";
  if (Object.keys(errors).length) return { ok: false, errors };

  const growth = input.growthRate / 100;
  const discount = input.discountRate / 100;
  const terminalGrowth = input.terminalGrowthRate / 100;
  const projections = Array.from({ length: input.years }, (_, index) => {
    const year = index + 1;
    const cashFlow = input.cashFlow * (1 + growth) ** year;
    const discountFactor = 1 / (1 + discount) ** year;
    return {
      year,
      cashFlow,
      discountFactor,
      presentValue: cashFlow * discountFactor,
    };
  });
  const projectedPresentValue = projections.reduce(
    (sum, row) => sum + row.presentValue,
    0,
  );
  const finalCashFlow = projections[projections.length - 1].cashFlow;
  const terminalCashFlow = finalCashFlow * (1 + terminalGrowth);
  const terminalValue = terminalCashFlow / (discount - terminalGrowth);
  const terminalPresentValue = terminalValue / (1 + discount) ** input.years;
  const enterpriseValue = projectedPresentValue + terminalPresentValue;
  const equityValue = enterpriseValue + input.cash - input.debt;
  const valuePerShare = equityValue / input.shares;
  const terminalWeight =
    enterpriseValue > 0 ? terminalPresentValue / enterpriseValue : 0;
  if (
    ![
      projectedPresentValue,
      terminalCashFlow,
      terminalValue,
      terminalPresentValue,
      enterpriseValue,
      equityValue,
      valuePerShare,
      terminalWeight,
    ].every(Number.isFinite)
  )
    return {
      ok: false,
      errors: {
        terminalGrowthRate:
          "计算超出数值范围，请缩小金额或增大折现率与永续增长率的差值。",
      },
    };
  return {
    ok: true,
    value: {
      projections,
      projectedPresentValue,
      terminalCashFlow,
      terminalValue,
      terminalPresentValue,
      enterpriseValue,
      equityValue,
      valuePerShare,
      terminalWeight,
    },
  };
}
