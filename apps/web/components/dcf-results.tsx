import type { DcfInput, DcfValue } from "@value-investing/valuation";

const numberFormat = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function formatDcfNumber(value: number) {
  if (value !== 0 && Math.abs(value) < 0.01) return value.toExponential(2);
  return numberFormat.format(value);
}

export function DcfResults({
  value,
  input,
}: {
  value: DcfValue;
  input: DcfInput;
}) {
  const terminalPercent = value.terminalWeight * 100;
  const operatingPercent = 100 - terminalPercent;
  const lines = [
    { label: "预测期现金流现值", value: value.projectedPresentValue },
    { label: "终值现值", value: value.terminalPresentValue },
    { label: "企业价值（EV）", value: value.enterpriseValue, strong: true },
    { label: "加：现金及非经营资产", value: input.cash },
    { label: "减：债务及优先索偿", value: -input.debt },
    { label: "股权价值", value: value.equityValue, strong: true },
  ];
  return (
    <>
      <div className="site-rule rounded-2xl border bg-[var(--forest-soft)] p-6 md:p-8">
        <div aria-live="polite" aria-atomic="true">
          <h2 className="site-forest text-sm font-medium">假设下的每股估值</h2>
          <p className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="site-serif break-all text-4xl font-medium tracking-tight md:text-5xl">
              {formatDcfNumber(value.valuePerShare)}
            </span>
            <span className="site-muted text-sm">元 / 股</span>
          </p>
        </div>
        {value.equityValue <= 0 && (
          <p role="status" className="mt-4 text-sm font-medium leading-6">
            股权价值不为正：该组假设下，经营价值与可加回资产不足以覆盖优先索偿。这不等同于股票可按负价格交易。
          </p>
        )}
        <dl className="mt-7 space-y-3">
          {lines.map((line) => (
            <div
              key={line.label}
              className={`flex items-baseline justify-between gap-4 text-sm ${line.strong ? "site-rule border-t pt-3 font-semibold" : "site-muted"}`}
            >
              <dt>{line.label}</dt>
              <dd className="shrink-0 font-mono tabular-nums">
                {formatDcfNumber(line.value)}
                <span className="ml-1 text-xs font-normal">亿元</span>
              </dd>
            </div>
          ))}
        </dl>
        <p className="site-muted mt-4 text-xs leading-6">
          股权价值 ÷ {formatDcfNumber(input.shares)} 亿股 =
          每股估值。计算保留完整精度，仅展示时四舍五入。
        </p>
      </div>
      <div className="mt-7">
        <h3 className="text-sm font-medium">企业价值来自哪里</h3>
        <div
          role="img"
          aria-label={`预测期现金流现值占 ${operatingPercent.toFixed(1)}%，终值现值占 ${terminalPercent.toFixed(1)}%。`}
          className="mt-3 flex h-3 overflow-hidden rounded-full bg-[var(--paper-deep)]"
        >
          <div
            className="bg-[var(--forest)]"
            style={{ width: `${operatingPercent}%` }}
          />
          <div
            className="bg-[var(--gold)]"
            style={{ width: `${terminalPercent}%` }}
          />
        </div>
        <div className="site-muted mt-3 flex flex-wrap justify-between gap-3 text-xs">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--forest)]" />
            预测期现值 {operatingPercent.toFixed(1)}%
          </span>
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--gold)]" />
            终值现值 {terminalPercent.toFixed(1)}%
          </span>
        </div>
        {terminalPercent > 75 && (
          <p className="site-muted mt-3 text-xs leading-6">
            终值现值超过企业价值的
            75%，结果较依赖长期假设。请尤其审视永续增长率和折现率。
          </p>
        )}
        {input.discountRate - input.terminalGrowthRate < 1 && (
          <p className="mt-3 text-xs font-medium leading-6 text-[var(--gold)]">
            折现率与永续增长率相差不足 1 个百分点，终值可能被显著放大。
          </p>
        )}
      </div>
      <details className="site-rule mt-7 rounded-xl border p-4" open>
        <summary className="cursor-pointer text-sm font-medium">
          逐年现金流与折现明细
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-right text-xs tabular-nums">
            <caption className="site-muted mb-3 text-left text-xs">
              金额单位：亿元；折现因子不含单位
            </caption>
            <thead className="site-muted">
              <tr className="site-rule border-b">
                <th scope="col" className="pb-3 text-left font-normal">
                  年份
                </th>
                <th scope="col" className="px-2 pb-3 font-normal">
                  FCFF
                </th>
                <th scope="col" className="px-2 pb-3 font-normal">
                  折现因子
                </th>
                <th scope="col" className="pb-3 font-normal">
                  现值
                </th>
              </tr>
            </thead>
            <tbody>
              {value.projections.map((row) => (
                <tr key={row.year} className="site-rule border-b">
                  <th scope="row" className="py-3 text-left font-normal">
                    第 {row.year} 年
                  </th>
                  <td className="px-2 py-3 font-mono">
                    {formatDcfNumber(row.cashFlow)}
                  </td>
                  <td className="px-2 py-3 font-mono">
                    {row.discountFactor.toFixed(4)}
                  </td>
                  <td className="py-3 font-mono">
                    {formatDcfNumber(row.presentValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="site-muted mt-4 space-y-2 text-xs leading-6">
          <div className="flex flex-wrap justify-between gap-2">
            <dt>第 {input.years + 1} 年 FCFF（仅用于终值）</dt>
            <dd className="font-mono">
              {formatDcfNumber(value.terminalCashFlow)} 亿元
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <dt>第 {input.years} 年末终值（未折现）</dt>
            <dd className="font-mono">
              {formatDcfNumber(value.terminalValue)} 亿元
            </dd>
          </div>
        </dl>
      </details>
      <details className="site-rule mt-4 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          查看计算公式
        </summary>
        <div className="site-muted mt-4 space-y-3 text-xs leading-6">
          <p>
            第 t 年 FCFF = 基期 FCFF × (1 + 预测增速)<sup>t</sup>
          </p>
          <p>
            第 t 年现值 = 第 t 年 FCFF ÷ (1 + WACC)<sup>t</sup>
          </p>
          <p>
            第 N 年末终值 = 第 N 年 FCFF × (1 + 永续增速) ÷ (WACC − 永续增速)
          </p>
          <p>
            企业价值 = 第 1 至 N 年现值合计 + 终值 ÷ (1 + WACC)<sup>N</sup>
          </p>
          <p>股权价值 = 企业价值 + 可加回资产 − 债务及优先索偿</p>
          <p>每股估值 = 股权价值 ÷ 总股数</p>
          <p>
            公式内的增长率与折现率以小数计算，如输入 10 表示 10%，公式使用
            0.10。N 为预测年数。第 N+1 年现金流不重复计入预测期现值。
          </p>
        </div>
      </details>
    </>
  );
}
