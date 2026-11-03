import type {
  AnnualReturnInput,
  AnnualReturnValue,
} from "@value-investing/valuation/annual-return";
import { formatDcfNumber as format } from "@/components/dcf-results";

function formatPercent(value: number) {
  if (value > -100 && value < -99.995)
    return `−100% 附近（未达到 −100%；保留精度值 ${value.toPrecision(15)}%）`;
  if (Math.abs(value) < 1e-8) return "0.00%";
  return `${format(value)}%`;
}

export function AnnualReturnResults({
  value,
  input,
}: {
  value: AnnualReturnValue;
  input: AnnualReturnInput;
}) {
  return (
    <>
      <div className="site-rule rounded-2xl border bg-[var(--forest-soft)] p-6 md:p-8">
        <div aria-live="polite" aria-atomic="true">
          <h2 className="site-forest text-sm font-medium">
            含现金分红的预期年化收益（IRR）
          </h2>
          <p className="site-serif mt-4 break-words text-4xl font-medium tracking-tight md:text-5xl">
            {formatPercent(value.irr)}
          </p>
          <p className="site-muted mt-4 text-xs leading-6">
            按每年末现金流计算，不代表分红再投资，也不是保证收益。
          </p>
        </div>
        <dl className="site-rule mt-6 space-y-3 border-t pt-4 text-sm">
          {[
            ["不含分红的股价年化收益（CAGR）", formatPercent(value.priceCagr)],
            ["隐含买入市盈率", `${format(value.entryPe)} 倍`],
            ["预计退出价格", `${format(value.exitPrice)} 元 / 股`],
            ["累计现金分红", `${format(value.totalDividends)} 元 / 股`],
            ["累计收款（不含利息）", `${format(value.totalProceeds)} 元 / 股`],
            ["累计盈亏", `${format(value.totalProfit)} 元 / 股`],
            ["持有期总回报（非年化）", formatPercent(value.totalReturn)],
          ].map(([label, amount]) => (
            <div
              key={label}
              className="flex flex-wrap items-baseline justify-between gap-2"
            >
              <dt className="site-muted">{label}</dt>
              <dd className="font-mono tabular-nums">{amount}</dd>
            </div>
          ))}
        </dl>
        {value.irr < 0 && (
          <p role="status" className="mt-5 text-sm leading-7">
            这组假设下年化回报为负。盈利增长、退出估值或分红不足以覆盖买入成本。
          </p>
        )}
      </div>
      <section className="mt-7">
        <h3 className="text-sm font-medium">股价回报来自盈利与估值变化</h3>
        <p className="site-muted mt-3 text-sm leading-7">
          EPS 年增速：{formatPercent(input.earningsGrowthRate)}
          ；估值倍数的年化变化：{formatPercent(value.multipleAnnualChange)}。
        </p>
        <p className="site-muted mt-2 text-xs leading-6">
          1 + 股价 CAGR = (1 + EPS 增速) × (退出 PE ÷ 买入 PE)
          <sup>1 / 持有年数</sup>
          。两项是乘法关系，不可简单相加；现金分红另按时点计入 IRR。
        </p>
      </section>
      <details className="site-rule mt-7 rounded-xl border p-4" open>
        <summary className="cursor-pointer text-sm font-medium">
          逐年盈利与现金流
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full whitespace-nowrap text-right text-xs tabular-nums">
            <caption className="site-muted mb-3 text-left">
              单位：人民币元 / 股；买入时现金流为 −{format(input.buyPrice)}
            </caption>
            <thead className="site-muted">
              <tr className="site-rule border-b">
                <th scope="col" className="pb-3 text-left font-normal">
                  时点
                </th>
                <th scope="col" className="px-2 pb-3 font-normal">
                  EPS
                </th>
                <th scope="col" className="px-2 pb-3 font-normal">
                  分红
                </th>
                <th scope="col" className="px-2 pb-3 font-normal">
                  出售收入
                </th>
                <th scope="col" className="pb-3 font-normal">
                  现金流
                </th>
              </tr>
            </thead>
            <tbody>
              {value.projections.map((row) => (
                <tr key={row.year} className="site-rule border-b">
                  <th scope="row" className="py-3 text-left font-normal">
                    第 {row.year} 年末
                  </th>
                  <td className="px-2 py-3 font-mono">{format(row.eps)}</td>
                  <td className="px-2 py-3 font-mono">
                    {format(row.dividend)}
                  </td>
                  <td className="px-2 py-3 font-mono">
                    {format(row.saleProceeds)}
                  </td>
                  <td className="py-3 font-mono">{format(row.cashFlow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="site-muted mt-4 text-xs leading-6">
          只在第 {input.years}{" "}
          年末卖出，最后一年的分红只计一次。计算保留完整精度，展示时才四舍五入。
        </p>
      </details>
      <details className="site-rule mt-4 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          计算公式与校验
        </summary>
        <div className="site-muted mt-4 space-y-3 text-xs leading-6">
          <p>
            第 t 年 EPS = 基期 EPS × (1 + 盈利增速)<sup>t</sup>
          </p>
          <p>第 t 年分红 = 第 t 年 EPS × 分红支付率</p>
          <p>退出股价 = 第 N 年 EPS × 退出 PE</p>
          <p>
            股价 CAGR = (退出股价 ÷ 买入价)<sup>1 / N</sup> − 1
          </p>
          <p>
            IRR 满足：−买入价 + Σ [每年现金流 ÷ (1 + IRR)<sup>t</sup>] = 0
          </p>
          <p>
            第 N 年现金流 = 当年分红 + 退出股价，之前各年现金流仅为分红。N
            为持有年数，公式内的百分比使用小数。
          </p>
          <p>
            IRR 回代的净现值误差 ÷ 买入价：
            {value.relativeNpvError.toExponential(2)}。相对误差超过 1 × 10
            <sup>−8</sup> 时不展示结果。
          </p>
        </div>
      </details>
    </>
  );
}
