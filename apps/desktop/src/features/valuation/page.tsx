import {
  calculateDcf,
  type DcfField,
  type DcfInput,
} from "@value-investing/valuation";
import { useState } from "react";

const fields: { key: DcfField; label: string; unit: string }[] = [
  { key: "cashFlow", label: "基期企业自由现金流（FCFF）", unit: "亿元" },
  { key: "growthRate", label: "预测期年增长率", unit: "%" },
  { key: "years", label: "预测年数", unit: "年" },
  { key: "discountRate", label: "折现率（WACC）", unit: "%" },
  { key: "terminalGrowthRate", label: "永续增长率", unit: "%" },
  { key: "cash", label: "可加回现金及非经营资产", unit: "亿元" },
  { key: "debt", label: "有息债务及优先索偿", unit: "亿元" },
  { key: "shares", label: "稀释后总股数", unit: "亿股" },
];
const empty: Record<DcfField, string> = {
  cashFlow: "",
  growthRate: "",
  years: "",
  discountRate: "",
  terminalGrowthRate: "",
  cash: "",
  debt: "",
  shares: "",
};
const example: Record<DcfField, string> = {
  cashFlow: "10",
  growthRate: "5",
  years: "5",
  discountRate: "10",
  terminalGrowthRate: "2",
  cash: "20",
  debt: "30",
  shares: "10",
};
const format = (value: number) =>
  value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });

export function ValuationPage() {
  const [form, setForm] = useState(empty);
  const [isExample, setIsExample] = useState(false);
  const input = Object.fromEntries(
    fields.map(({ key }) => [
      key,
      form[key].trim() ? Number(form[key]) : Number.NaN,
    ]),
  ) as DcfInput;
  const result = calculateDcf(input);
  return (
    <>
      <header>
        <p className="eyebrow">共享算法，独立界面</p>
        <h1>DCF 估值工具</h1>
      </header>
      <p className="lead">
        固定年增速、年末折现与永续增长终值。金额为亿元，股数为亿股，每股结果为元。
      </p>
      <div className="toolbar">
        <button
          type="button"
          onClick={() => {
            setForm(example);
            setIsExample(true);
          }}
        >
          载入示例
        </button>
        <button
          type="button"
          onClick={() => {
            setForm(empty);
            setIsExample(false);
          }}
        >
          清空
        </button>
      </div>
      {isExample && (
        <p role="status" className="notice">
          当前为虚构示例，不对应任何公司。
        </p>
      )}
      <form
        className="field-grid"
        aria-label="桌面 DCF 输入"
        onSubmit={(event) => event.preventDefault()}
      >
        {fields.map(({ key, label, unit }) => {
          const error =
            !result.ok && form[key].trim() ? result.errors[key] : undefined;
          return (
            <div key={key}>
              <label htmlFor={`desktop-${key}`}>
                {label} · {unit}
              </label>
              <input
                id={`desktop-${key}`}
                type="number"
                step={key === "years" ? "1" : "any"}
                value={form[key]}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `error-${key}` : undefined}
                onChange={(event) => {
                  setForm({ ...form, [key]: event.target.value });
                  setIsExample(false);
                }}
              />
              {error && (
                <p className="error" id={`error-${key}`}>
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </form>
      <section className="panel" aria-label="估值结果" aria-live="polite">
        <h2>计算结果</h2>
        {result.ok ? (
          <dl className="results">
            <div>
              <dt>企业价值</dt>
              <dd>{format(result.value.enterpriseValue)} 亿元</dd>
            </div>
            <div>
              <dt>股权价值</dt>
              <dd>{format(result.value.equityValue)} 亿元</dd>
            </div>
            <div>
              <dt>每股估值</dt>
              <dd>{format(result.value.valuePerShare)} 元 / 股</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            补齐所有输入并修正错误后显示计算结果；未知数值不按零处理。
          </p>
        )}
      </section>
      <p className="muted">
        输入不上传、不保存，离开页面后清空。结果是输入假设的计算值，不构成投资建议。
      </p>
    </>
  );
}
