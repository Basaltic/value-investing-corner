"use client";

import {
  type AnnualReturnField,
  type AnnualReturnInput,
  calculateAnnualReturn,
} from "@value-investing/valuation/annual-return";
import { useState } from "react";
import { annualReturnFields } from "@/components/annual-return-fields";
import { AnnualReturnResults } from "@/components/annual-return-results";

type FormValues = Record<AnnualReturnField, string>;
const emptyForm: FormValues = {
  buyPrice: "",
  baseEps: "",
  earningsGrowthRate: "",
  years: "",
  exitPe: "",
  payoutRatio: "",
};
const exampleForm: FormValues = {
  buyPrice: "20",
  baseEps: "1",
  earningsGrowthRate: "10",
  years: "5",
  exitPe: "20",
  payoutRatio: "30",
};

export function AnnualReturnCalculator() {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [fromExample, setFromExample] = useState(false);
  const input: AnnualReturnInput = {
    buyPrice: numeric(form.buyPrice),
    baseEps: numeric(form.baseEps),
    earningsGrowthRate: numeric(form.earningsGrowthRate),
    years: numeric(form.years),
    exitPe: numeric(form.exitPe),
    payoutRatio: numeric(form.payoutRatio),
  };
  const result = calculateAnnualReturn(input);
  const missing = Object.values(form).some((value) => !value.trim());
  const started = Object.values(form).some((value) => value.trim());

  return (
    <>
      <div className="site-rule mb-8 flex flex-wrap items-center justify-between gap-4 border-y py-4 text-sm">
        <p className="site-muted">
          以持有一股计算；每年末收取分红，
          <span className="site-ink font-medium">不再投入</span>
          ；金额统一使用人民币元 / 股。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setForm(exampleForm);
              setFromExample(true);
            }}
            className="min-h-11 rounded-lg bg-[var(--forest-soft)] px-4 font-medium text-[var(--forest)] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            载入示例
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setFromExample(false);
            }}
            className="site-rule min-h-11 rounded-lg border px-4 hover:bg-[var(--paper-deep)] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            清空
          </button>
        </div>
      </div>
      {fromExample && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-[var(--forest-soft)] px-4 py-3 text-sm text-[var(--forest)]"
        >
          输入由虚构示例开始，不对应任何公司。修改部分字段后，其他字段仍可能是示例数据，请逐项确认。
        </p>
      )}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form
          aria-label="预期年化收益输入"
          onSubmit={(event) => event.preventDefault()}
        >
          <fieldset>
            <legend className="site-serif mb-5 text-xl font-medium">
              买入与持有假设
            </legend>
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
              {annualReturnFields.map((field) => {
                const error =
                  !result.ok && form[field.key].trim()
                    ? result.errors[field.key]
                    : undefined;
                return (
                  <div key={field.key}>
                    <label
                      htmlFor={`annual-${field.key}`}
                      className="mb-2 block text-sm font-medium"
                    >
                      {field.label}
                    </label>
                    <div className="site-rule flex items-center rounded-lg border bg-[var(--paper-deep)] focus-within:border-[var(--forest)] focus-within:outline-1 focus-within:outline-[var(--forest)]">
                      <input
                        id={`annual-${field.key}`}
                        name={field.key}
                        type="number"
                        step={field.key === "years" ? 1 : "any"}
                        inputMode="decimal"
                        required
                        value={form[field.key]}
                        placeholder={`例如 ${field.example}`}
                        aria-invalid={Boolean(error)}
                        aria-describedby={`annual-hint-${field.key}`}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                        className="min-h-12 w-full min-w-0 rounded-lg bg-transparent px-3 font-mono text-base outline-none"
                      />
                      <span className="site-muted shrink-0 pr-3 text-xs">
                        {field.unit}
                      </span>
                    </div>
                    <p
                      id={`annual-hint-${field.key}`}
                      className={`mt-2 text-xs leading-5 ${error ? "font-medium text-[var(--gold)]" : "site-muted"}`}
                    >
                      {error ?? field.hint}
                    </p>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <p className="site-muted mt-6 text-xs leading-6">
            所有字段均需填写，未知数据不按 0
            处理。输入仅在当前页面计算，不上传、不保存，刷新后清空。
          </p>
        </form>
        <section aria-label="预期年化收益结果" className="min-w-0">
          {result.ok ? (
            <AnnualReturnResults value={result.value} input={input} />
          ) : (
            <div
              className="site-rule rounded-2xl border px-7 py-12"
              aria-live="polite"
            >
              <p className="site-forest text-xs font-medium tracking-[0.15em]">
                价格与回报
              </p>
              <h2 className="site-serif mt-5 text-2xl font-medium">
                {!started
                  ? "这笔投资，可能带来怎样的回报？"
                  : missing
                    ? "补齐假设后即时计算"
                    : result.code === "numerical_error"
                      ? "无法可靠完成计算"
                      : "请先修正输入"}
              </h2>
              <p className="site-muted mt-4 text-sm leading-7">
                {!started
                  ? "填写买入价、盈利与退出估值假设，或载入示例。工具将分开显示含分红的 IRR 与不含分红的股价年化收益。"
                  : missing
                    ? "请补齐全部字段，不分红需明确填写支付率 0。"
                    : result.message}
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="site-rule mt-12 border-t pt-8">
        <h2 className="site-serif text-xl font-medium">计算口径与使用边界</h2>
        <div className="site-muted mt-4 grid gap-5 text-sm leading-7 md:grid-cols-2">
          <div>
            <p>
              主结果为每股现金流的内部收益率（IRR）：买入时支付股价，每年末收到现金分红，最后一年末收到分红后卖出。第
              1 年 EPS 从基期 EPS 按增长假设变化，不重复计入基期分红。
            </p>
            <p className="mt-3">
              分红不再投入，也不计利息；IRR
              衡量现金流时点，不意味着收到的分红会按该收益率再投资。累计收款是分红与售股收入的名义合计，不是复投后的期末财富。
            </p>
          </div>
          <div>
            <p>
              EPS 增速、分红支付率与退出 PE
              均为独立输入假设，不自动联动。提高支付率未必能维持原增速，请结合留存利润、再投资和融资需求检查假设是否一致。
            </p>
            <p className="mt-3">
              本工具不计税费、交易费用、追加投入、未来回购及稀释、通胀或汇率变化；不适用于基期亏损或用
              PE
              难以估值的企业。结果是给定假设的计算值，不是收益承诺或投资建议。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
function numeric(value: string) {
  return value.trim() ? Number(value) : Number.NaN;
}
