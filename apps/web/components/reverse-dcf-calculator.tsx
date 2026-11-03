"use client";

import {
  calculateReverseDcf,
  type ReverseDcfField,
  type ReverseDcfInput,
} from "@value-investing/valuation/reverse-dcf";
import { useState } from "react";
import { reverseDcfGroups } from "@/components/reverse-dcf-fields";
import { ReverseDcfResults } from "@/components/reverse-dcf-results";

type FormValues = Record<ReverseDcfField, string>;
const emptyForm: FormValues = {
  price: "",
  shares: "",
  cashFlow: "",
  cash: "",
  debt: "",
  years: "",
  discountRate: "",
  terminalGrowthRate: "",
};
const exampleForm: FormValues = {
  price: "14",
  shares: "10",
  cashFlow: "10",
  cash: "20",
  debt: "30",
  years: "5",
  discountRate: "10",
  terminalGrowthRate: "2",
};

export function ReverseDcfCalculator() {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [fromExample, setFromExample] = useState(false);
  const input: ReverseDcfInput = {
    price: numeric(form.price),
    shares: numeric(form.shares),
    cashFlow: numeric(form.cashFlow),
    cash: numeric(form.cash),
    debt: numeric(form.debt),
    years: numeric(form.years),
    discountRate: numeric(form.discountRate),
    terminalGrowthRate: numeric(form.terminalGrowthRate),
  };
  const result = calculateReverseDcf(input);
  const missing = Object.values(form).some((value) => !value.trim());
  const started = Object.values(form).some((value) => value.trim());

  return (
    <>
      <div className="site-rule mb-8 flex flex-wrap items-center justify-between gap-4 border-y py-4 text-sm">
        <p className="site-muted">
          股价：人民币元 / 股；金额：亿元；股数：亿股。只反推
          <span className="site-ink font-medium">预测期 FCFF 年增长率</span>。
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
          aria-label="反向 DCF 输入"
          onSubmit={(event) => event.preventDefault()}
          className="space-y-8"
        >
          {reverseDcfGroups.map((group) => (
            <fieldset key={group.title}>
              <legend className="site-serif mb-5 text-xl font-medium">
                {group.title}
              </legend>
              <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
                {group.fields.map((field) => {
                  const error =
                    !result.ok && form[field.key].trim()
                      ? result.errors[field.key]
                      : undefined;
                  return (
                    <div key={field.key}>
                      <label
                        htmlFor={`reverse-${field.key}`}
                        className="mb-2 block text-sm font-medium"
                      >
                        {field.label}
                      </label>
                      <div className="site-rule flex items-center rounded-lg border bg-[var(--paper-deep)] focus-within:border-[var(--forest)] focus-within:outline-1 focus-within:outline-[var(--forest)]">
                        <input
                          id={`reverse-${field.key}`}
                          name={field.key}
                          type="number"
                          step={field.key === "years" ? 1 : "any"}
                          inputMode="decimal"
                          required
                          value={form[field.key]}
                          placeholder={`例如 ${field.example}`}
                          aria-invalid={Boolean(error)}
                          aria-describedby={`reverse-hint-${field.key}`}
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
                        id={`reverse-hint-${field.key}`}
                        className={`mt-2 text-xs leading-5 ${error ? "font-medium text-[var(--gold)]" : "site-muted"}`}
                      >
                        {error ?? field.hint}
                      </p>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p className="site-muted text-xs leading-6">
            所有字段均需填写，未知值不按 0
            处理。输入仅在当前页面计算，不上传、不保存，刷新后清空。
          </p>
        </form>
        <section aria-label="反向 DCF 结果" className="min-w-0">
          {result.ok ? (
            <ReverseDcfResults result={result} input={input} />
          ) : (
            <div
              className="site-rule rounded-2xl border px-7 py-12"
              aria-live="polite"
            >
              <p className="site-forest text-xs font-medium tracking-[0.15em]">
                价格隐含的增长
              </p>
              <h2 className="site-serif mt-5 text-2xl font-medium">
                {!started
                  ? "这份价格，需要怎样的增长？"
                  : missing
                    ? "补齐数据后即时反推"
                    : result.code === "outside_range"
                      ? "当前假设下无法求解"
                      : result.code === "numerical_error"
                        ? "无法可靠完成计算"
                        : "请先修正输入"}
              </h2>
              <p className="site-muted mt-4 text-sm leading-7">
                {!started
                  ? "填写股价与基础数据，或载入示例。工具反推一个固定年增长率，并回代正向 DCF 验证价格。"
                  : missing
                    ? "请补齐所有字段，包括现金和债务；无此项需明确填 0。"
                    : result.message}
              </p>
              {!missing && !result.ok && result.priceRange && (
                <p className="site-muted mt-4 text-xs leading-6">
                  该组假设下，求解范围内的每股计算值约为{" "}
                  {result.priceRange.min.toPrecision(6)} 至{" "}
                  {result.priceRange.max.toPrecision(6)} 元 /
                  股；负值不代表股票可负价交易。
                </p>
              )}
            </div>
          )}
        </section>
      </div>
      <section className="site-rule mt-12 border-t pt-8">
        <h2 className="site-serif text-xl font-medium">
          先理解反推结果，再判断是否可信
        </h2>
        <div className="site-muted mt-4 grid gap-5 text-sm leading-7 md:grid-cols-2">
          <div>
            <p>
              反推的是使模型每股估值等于输入股价的预测期 FCFF
              年增长率，不是收入或净利润增速，也不是市场真实共识或未来增长预测。
            </p>
            <p className="mt-3">
              FCFF = EBIT ×（1 − 税率）+ 折旧摊销 − 资本开支 −
              经营性营运资本增加额。使用 WACC 折现，避免混用已扣除融资影响的
              FCFE。资产、债务与股数须保持同一时点和币种。
            </p>
          </div>
          <div>
            <p>
              沿用正向 DCF 的固定增速、年末折现和永续增长模型。数值求解范围为
              −99.99% 至
              100%（含端点）。折现率、永续增长率、股数及其他数据在求解时保持不变。
            </p>
            <p className="mt-3">
              无解可能来自求解范围、数据口径或模型适用性，不直接等于“高估”或“低估”。本工具不适用于负
              FCFF、银行或保险等需要不同估值口径的企业，不构成投资建议。
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
