import { calculateDcf, type DcfInput, type DcfValue } from "./dcf";

export type ReverseDcfInput = Omit<DcfInput, "growthRate"> & { price: number };
export type ReverseDcfField = keyof ReverseDcfInput;
export type ReverseDcfErrors = Partial<Record<ReverseDcfField, string>>;
export const reverseDcfGrowthRange = { min: -99.99, max: 100 } as const;
export type ReverseDcfResult =
  | {
      ok: true;
      growthRate: number;
      targetEquityValue: number;
      targetEnterpriseValue: number;
      priceDifference: number;
      dcf: DcfValue;
    }
  | {
      ok: false;
      code: "invalid_input" | "outside_range" | "numerical_error";
      errors: ReverseDcfErrors;
      message: string;
      priceRange?: { min: number; max: number };
    };

// Only the explicit-period FCFF growth rate is solved. The terminal rate is fixed.
// Bounds match the forward model's range, excluding -100% (zero future FCFF).
export function calculateReverseDcf(input: ReverseDcfInput): ReverseDcfResult {
  const validation = calculateDcf({ ...input, growthRate: 0 });
  const errors: ReverseDcfErrors = {};
  if (!validation.ok) {
    for (const field of Object.keys(input) as ReverseDcfField[]) {
      if (field !== "price" && validation.errors[field])
        errors[field] = validation.errors[field];
    }
  }
  if (!(Number.isFinite(input.price) && input.price > 0))
    errors.price = "股价必须是大于 0 的有效数字。";
  if (Object.keys(errors).length)
    return {
      ok: false,
      code: "invalid_input",
      errors,
      message: "请修正输入后再计算。",
    };

  const numericalError: ReverseDcfResult = {
    ok: false,
    code: "numerical_error",
    errors: {},
    message:
      "当前数据超出可靠数值精度，无法完成价格回代校验。请检查金额、单位以及折现率与永续增长率的差值。",
  };
  const targetEquityValue = input.price * input.shares;
  const targetEnterpriseValue = targetEquityValue - input.cash + input.debt;
  if (
    !Number.isFinite(targetEquityValue) ||
    !Number.isFinite(targetEnterpriseValue)
  )
    return numericalError;
  if (!(targetEnterpriseValue > 0))
    return {
      ok: false,
      code: "outside_range",
      errors: {},
      message:
        "股价对应的经营企业价值不为正（市值 − 可加回资产 + 债务 ≤ 0），与本工具的正 FCFF 模型不相容，无法反推增长率。",
    };

  // Solve against operating EV to avoid cash/debt cancellation in each iteration.
  const evaluate = (growthRate: number) =>
    calculateDcf({
      ...input,
      growthRate,
      cash: 0,
      debt: 0,
      shares: 1,
    });
  let low: number = reverseDcfGrowthRange.min;
  let high: number = reverseDcfGrowthRange.max;
  const lower = evaluate(low);
  const upper = evaluate(high);
  if (!lower.ok || !upper.ok) return numericalError;
  if (
    targetEnterpriseValue < lower.value.enterpriseValue ||
    targetEnterpriseValue > upper.value.enterpriseValue
  ) {
    const min =
      (lower.value.enterpriseValue + input.cash - input.debt) / input.shares;
    const max =
      (upper.value.enterpriseValue + input.cash - input.debt) / input.shares;
    return {
      ok: false,
      code: "outside_range",
      errors: {},
      message:
        targetEnterpriseValue < lower.value.enterpriseValue
          ? "当前股价要求的预测期增速低于 -99.99%，超出本工具的求解范围。不会将边界值当作求解结果。"
          : "当前股价要求的预测期增速高于 100%，超出本工具的求解范围。不会将边界值当作求解结果。",
      priceRange:
        Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined,
    };
  }

  const finalize = (growthRate: number): ReverseDcfResult => {
    const result = calculateDcf({ ...input, growthRate });
    if (!result.ok) return numericalError;
    const priceDifference = result.value.valuePerShare - input.price;
    // Verify the actual consumer result, not just the search interval width.
    if (Math.abs(priceDifference / input.price) > 1e-8) return numericalError;
    return {
      ok: true,
      growthRate,
      targetEquityValue,
      targetEnterpriseValue,
      priceDifference,
      dcf: result.value,
    };
  };
  if (targetEnterpriseValue === lower.value.enterpriseValue)
    return finalize(low);
  if (targetEnterpriseValue === upper.value.enterpriseValue)
    return finalize(high);
  for (let iteration = 0; iteration < 160; iteration++) {
    const mid = low + (high - low) / 2;
    const candidate = evaluate(mid);
    if (!candidate.ok) return numericalError;
    const error = candidate.value.enterpriseValue - targetEnterpriseValue;
    if (Math.abs(error / targetEnterpriseValue) <= 1e-11) return finalize(mid);
    if (mid === low || mid === high) return finalize(mid);
    if (error < 0) low = mid;
    else high = mid;
  }
  return numericalError;
}
