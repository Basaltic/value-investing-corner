import type { FactInput } from "../../adapters/finance";
export const factNames: Record<string, string> = {
  revenue: "营业收入",
  cost: "营业成本",
  net_income: "净利润",
  parent_net_income: "归母净利润",
  cfo: "经营现金流净额",
  capex: "资本开支（正支出）",
  assets: "总资产",
  liabilities: "总负债",
  equity: "股东权益",
  parent_equity: "归母权益",
};
export const derivedNames: Record<string, string> = {
  fcf: "自由现金流",
  roe: "ROE（归母期末权益）",
  gross_margin: "毛利率",
  net_margin: "净利率",
  debt_ratio: "资产负债率",
};
export const formulas: Record<string, string> = {
  fcf: "CFO − 资本开支（购建固定资产/无形资产等支出）",
  roe: "归母净利润 / 归母期末权益（不年化）",
  gross_margin: "（营业收入 − 营业成本）/ 营业收入",
  net_margin: "净利润 / 营业收入",
  debt_ratio: "总负债 / 总资产",
};
export const emptyFact: FactInput = {
  metric: "revenue",
  value: null,
  currency: "",
  unit: "",
  period_kind: "annual",
  period_start: "",
  period_end: "",
  standard: "",
  scope: "",
  basis: "",
  reviewed: false,
  source: "",
  tags: [],
};
export function isInstant(metric: string) {
  return ["assets", "liabilities", "equity", "parent_equity"].includes(metric);
}
export function completeContext(v: FactInput) {
  return [v.currency, v.unit, v.standard, v.scope, v.basis].every((s) =>
    s.trim(),
  );
}
export function completeObservationContext(v: {
  unit: string;
  basis: string;
  currency: string;
}) {
  return Boolean(v.unit.trim() && v.basis.trim());
}
export function contextKey(v: FactInput, includeDates = false) {
  return JSON.stringify([
    v.currency,
    v.unit,
    v.standard,
    v.scope,
    v.basis,
    v.period_kind,
    ...(includeDates
      ? [v.period_start, v.period_end]
      : v.period_kind === "instant"
        ? []
        : [
            v.period_start.slice(5),
            v.period_end.slice(5),
            Number(v.period_end.slice(0, 4)) -
              Number(v.period_start.slice(0, 4)),
          ]),
  ]);
}
export function displayNumber(value: number | null, percent = false) {
  if (value === null) return "缺值";
  return percent
    ? `${(value * 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`
    : value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}
export const tagInput = (text: string) =>
  text
    .split(/[，,]/)
    .map((s) => s.trim())
    .filter(Boolean);
