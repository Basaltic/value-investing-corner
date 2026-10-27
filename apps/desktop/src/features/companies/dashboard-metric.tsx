import { lazy, Suspense } from "react";
import type { DashboardCard } from "../../adapters/dashboard";
import type { FinanceState } from "../../adapters/finance";
import { metricView } from "./dashboard-model";
import { displayNumber, formulas } from "./finance-meta";

const Trend = lazy(() =>
  import("./finance-trend").then((m) => ({ default: m.FinanceTrend })),
);
export function DashboardMetric({
  card,
  data,
}: {
  card: DashboardCard;
  data: FinanceState;
}) {
  const v = metricView(data, card.selection, card.from, card.to);
  if (v.type === "empty") return <p>{v.issue}。</p>;
  return (
    <>
      <h4>{v.label}</h4>
      <p className="muted">
        {v.unit}；范围 {card.from || "不限"} 至 {card.to || "不限"}
        。只取当前版本，不回退旧已核对版本。
      </p>
      {card.selection?.kind === "derived" && (
        <p>{formulas[card.selection.metric]}</p>
      )}
      {v.issue && <p className="error">{v.issue}</p>}
      {v.type === "text" ? (
        <ul>
          {v.texts
            .filter((r) => card.show_pending || r.reviewed)
            .map((r) => (
              <li key={r.id} className={r.reviewed ? "" : "muted"}>
                {r.date}：{r.value ?? "缺值"}（{r.reviewed ? "已核对" : "待核"}
                ）
              </li>
            ))}
        </ul>
      ) : v.labels.length ? (
        <>
          <Suspense fallback={<p>加载本地趋势图…</p>}>
            <Trend
              labels={v.labels}
              reviewed={v.reviewed}
              pending={v.pending}
              showPending={card.show_pending}
              unit={v.unit}
            />
          </Suspense>
          <div className="finance-scroll">
            <table>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>已核对</th>
                  {card.show_pending && <th>待核</th>}
                </tr>
              </thead>
              <tbody>
                {v.labels.map((d, i) => (
                  <tr key={d}>
                    <td>{d}</td>
                    <td>{displayNumber(v.reviewed[i], v.percent)}</td>
                    {card.show_pending && (
                      <td className="muted">
                        {displayNumber(v.pending[i], v.percent)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>所选范围无观测，缺值不填0。</p>
      )}
    </>
  );
}
