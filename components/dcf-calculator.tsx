"use client";

import { useState } from "react";
import { DcfResults } from "@/components/dcf-results";
import { calculateDcf, type DcfField, type DcfInput } from "@/lib/dcf";

type FormValues = Record<DcfField, string>;
const emptyForm: FormValues = {
  cashFlow: "",
  growthRate: "",
  years: "",
  discountRate: "",
  terminalGrowthRate: "",
  cash: "",
  debt: "",
  shares: "",
};
const exampleForm: FormValues = {
  cashFlow: "10",
  growthRate: "5",
  years: "5",
  discountRate: "10",
  terminalGrowthRate: "2",
  cash: "20",
  debt: "30",
  shares: "10",
};
const groups: {
  title: string;
  fields: {
    key: DcfField;
    label: string;
    unit: string;
    hint: string;
    placeholder: string;
  }[];
}[] = [
  {
    title: "基础数据",
    fields: [
      {
        key: "cashFlow",
        label: "基期企业自由现金流",
        unit: "亿元",
        hint: "最近一年或经正常化的 FCFF，不是净利润。",
        placeholder: "例如 10",
      },
      {
        key: "cash",
        label: "可加回的现金及非经营资产",
        unit: "亿元",
        hint: "仅填未计入经营现金流价值的可分配资产；无则填 0。",
        placeholder: "例如 20",
      },
      {
        key: "debt",
        label: "有息债务及其他优先索偿",
        unit: "亿元",
        hint: "包括需扣除的少数股东权益等；无则填 0。",
        placeholder: "例如 30",
      },
      {
        key: "shares",
        label: "总股数",
        unit: "亿股",
        hint: "建议使用稀释后总股数，不是流通股数。",
        placeholder: "例如 10",
      },
    ],
  },
  {
    title: "预测与折现假设",
    fields: [
      {
        key: "growthRate",
        label: "预测期年增长率",
        unit: "%",
        hint: "各预测年采用同一增长率，可为负值。",
        placeholder: "例如 5",
      },
      {
        key: "years",
        label: "预测年数",
        unit: "年",
        hint: "1–30 年，第 1 年从基期现金流开始增长。",
        placeholder: "例如 5",
      },
      {
        key: "discountRate",
        label: "折现率（WACC）",
        unit: "%",
        hint: "与 FCFF 口径对应的加权平均资本成本。",
        placeholder: "例如 10",
      },
      {
        key: "terminalGrowthRate",
        label: "永续增长率",
        unit: "%",
        hint: "预测期结束后的长期增速，必须小于折现率。",
        placeholder: "例如 2",
      },
    ],
  },
];

export function DcfCalculator() {
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [isExample, setIsExample] = useState(false);
  const input = Object.fromEntries(
    Object.entries(form).map(([key, value]) => [
      key,
      value.trim() === "" ? Number.NaN : Number(value),
    ]),
  ) as DcfInput;
  const result = calculateDcf(input);
  const missing = Object.values(form).some((value) => value.trim() === "");
  const started = Object.values(form).some((value) => value.trim() !== "");

  return (
    <>
      <div className="site-rule mb-8 flex flex-wrap items-center justify-between gap-4 border-y py-4 text-sm">
        <p className="site-muted">
          金额统一使用人民币<span className="site-ink font-medium">亿元</span>
          ，股数使用<span className="site-ink font-medium">亿股</span>，结果为
          <span className="site-ink font-medium">元 / 股</span>。
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setForm(exampleForm);
              setIsExample(true);
            }}
            className="min-h-11 rounded-lg bg-[var(--forest-soft)] px-4 font-medium text-[var(--forest)] hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            载入示例
          </button>
          <button
            type="button"
            onClick={() => {
              setForm(emptyForm);
              setIsExample(false);
            }}
            className="site-rule min-h-11 rounded-lg border px-4 hover:bg-[var(--paper-deep)] focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            清空
          </button>
        </div>
      </div>
      {isExample && (
        <p
          role="status"
          className="mb-6 rounded-lg bg-[var(--forest-soft)] px-4 py-3 text-sm text-[var(--forest)]"
        >
          当前为虚构示例数据，仅演示计算，不对应任何公司。
        </p>
      )}
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form
          aria-label="DCF 估值输入"
          onSubmit={(event) => event.preventDefault()}
          className="space-y-8"
        >
          {groups.map((group) => (
            <fieldset key={group.title}>
              <legend className="site-serif mb-5 text-xl font-medium">
                {group.title}
              </legend>
              <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2">
                {group.fields.map((field) => {
                  const error =
                    !result.ok && form[field.key].trim() !== ""
                      ? result.errors[field.key]
                      : undefined;
                  return (
                    <div key={field.key}>
                      <label
                        htmlFor={`dcf-${field.key}`}
                        className="mb-2 block text-sm font-medium"
                      >
                        {field.label}
                      </label>
                      <div className="site-rule flex items-center rounded-lg border bg-[var(--paper-deep)] focus-within:border-[var(--forest)] focus-within:outline-1 focus-within:outline-[var(--forest)]">
                        <input
                          id={`dcf-${field.key}`}
                          name={field.key}
                          type="number"
                          step={field.key === "years" ? "1" : "any"}
                          inputMode="decimal"
                          required
                          value={form[field.key]}
                          placeholder={field.placeholder}
                          aria-invalid={Boolean(error)}
                          aria-describedby={`dcf-hint-${field.key}`}
                          onChange={(event) => {
                            setForm({
                              ...form,
                              [field.key]: event.target.value,
                            });
                            setIsExample(false);
                          }}
                          className="min-h-12 w-full min-w-0 rounded-lg bg-transparent px-3 font-mono text-base outline-none"
                        />
                        <span className="site-muted shrink-0 pr-3 text-xs">
                          {field.unit}
                        </span>
                      </div>
                      <p
                        id={`dcf-hint-${field.key}`}
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
            所有字段均需填写，未知数据不会按 0
            计算。输入仅用于当前页面计算，不上传、不保存；刷新后清空。
          </p>
        </form>
        <section aria-label="估值结果" className="min-w-0">
          {result.ok ? (
            <DcfResults value={result.value} input={input} />
          ) : (
            <div className="site-rule rounded-2xl border px-7 py-12">
              <p className="site-forest text-xs font-medium tracking-[0.15em]">
                估值结果
              </p>
              <h2 className="site-serif mt-5 text-2xl font-medium">
                {!started
                  ? "从一组有依据的假设开始"
                  : missing
                    ? "补齐输入后，即时显示结果"
                    : "请先修正输入"}
              </h2>
              <p className="site-muted mt-4 text-sm leading-7">
                {!started
                  ? "填入左侧数据，或载入示例体验计算。结果会展示企业价值、股权价值、每股估值和逐年折现明细。"
                  : "留空的数据不参与估值。请确认金额与股数单位，并确保永续增长率小于折现率。"}
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
              FCFF = 息税前利润 ×（1 − 税率）+ 折旧摊销 − 资本开支 −
              经营性营运资本增加额。直接从“经营现金流 −
              资本开支”取数前，需检查利息与税项口径是否符合 FCFF。
            </p>
            <p className="mt-3">
              FCFF 使用 WACC
              折现，不要混用已扣除债务融资影响的股权自由现金流。金额、股数、资产和债务应采用一致的时点与币种。
            </p>
          </div>
          <div>
            <p>
              本工具采用固定年增速、年末折现与永续增长终值。它没有模拟多阶段经营、未来融资和股数变化，也不适合直接套用于银行、保险或持续负现金流企业。
            </p>
            <p className="mt-3">
              估值对长期增长与折现率敏感。结果是输入假设的计算值，不是确定目标价，不构成投资建议。
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
