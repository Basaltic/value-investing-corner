import type {
  ReverseDcfInput,
  ReverseDcfResult,
} from "@value-investing/valuation/reverse-dcf";
import { DcfResults, formatDcfNumber } from "@/components/dcf-results";

export function ReverseDcfResults({
  result,
  input,
}: {
  result: Extract<ReverseDcfResult, { ok: true }>;
  input: ReverseDcfInput;
}) {
  const last = result.dcf.projections[result.dcf.projections.length - 1];
  const multiple = last.cashFlow / input.cashFlow;
  return (
    <>
      <div className="site-rule rounded-2xl border bg-[var(--forest-soft)] p-6 md:p-8">
        <div aria-live="polite" aria-atomic="true">
          <h2 className="site-forest text-sm font-medium">
            股价隐含的预测期 FCFF 年增长率
          </h2>
          <p className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="site-serif break-all text-4xl font-medium tracking-tight md:text-5xl">
              {formatDcfNumber(result.growthRate)}
            </span>
            <span className="site-muted text-sm">% / 年</span>
          </p>
          <p className="site-muted mt-4 text-sm leading-7">
            在其他输入保持不变时，未来 {input.years} 年 FCFF 需按约{" "}
            {formatDcfNumber(result.growthRate)}%
            的固定年增速变化，才能使模型每股估值与{" "}
            {formatDcfNumber(input.price)} 元 / 股相匹配。
          </p>
        </div>
        <dl className="site-rule mt-6 space-y-3 border-t pt-4 text-sm">
          {[
            [
              `第 ${input.years} 年 FCFF`,
              `${formatDcfNumber(last.cashFlow)} 亿元`,
            ],
            ["相对基期现金流", `${formatDcfNumber(multiple)} 倍`],
            [
              "股价对应股权市值",
              `${formatDcfNumber(result.targetEquityValue)} 亿元`,
            ],
            [
              "股价对应企业价值",
              `${formatDcfNumber(result.targetEnterpriseValue)} 亿元`,
            ],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap justify-between gap-2">
              <dt className="site-muted">{label}</dt>
              <dd className="font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="site-muted mt-4 text-xs leading-6">
          企业价值 = 股价 × 总股数 − 可加回资产 + 债务及优先索偿。输入元 /
          股与亿股相乘，得到亿元。
        </p>
      </div>
      <div className="mt-6 space-y-3 text-sm leading-7">
        <p>
          {result.growthRate < 0
            ? "这组假设下，模型允许预测期现金流逐年下降仍匹配当前价格；这不保证公司不会更快衰退。"
            : "关键不是这个增速看起来高不高，而是企业的竞争地位、再投资机会与现金转化能否支持它。"}
        </p>
        <p className="site-muted">
          这是一组给定假设的等价解，不是买卖信号。改变 WACC
          或永续增长率，隐含增速也会变化。
        </p>
      </div>
      <details className="site-rule mt-7 border-t pt-5" open>
        <summary className="cursor-pointer text-sm font-medium">
          回代估值与逐年明细
        </summary>
        <p className="site-muted my-4 text-xs leading-6">
          将未四舍五入的增长率回代正向 DCF，验证每股价格的相对误差不超过
          0.000001%。当前价格误差：{result.priceDifference.toExponential(2)} 元
          / 股。展示增速四舍五入后自行回代可能略有差异。
        </p>
        <DcfResults
          value={result.dcf}
          input={{ ...input, growthRate: result.growthRate }}
        />
      </details>
    </>
  );
}
