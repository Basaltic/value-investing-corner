import { lazy, Suspense, useMemo, useState } from "react";
import type {
  FactInput,
  FinanceState,
  ObservationInput,
  Version,
} from "../../adapters/finance";
import {
  completeContext,
  completeObservationContext,
  contextKey,
  derivedNames,
  displayNumber,
  factNames,
  formulas,
} from "./finance-meta";
import { buildSeries, latestVersions } from "./finance-series";

const FinanceTrend = lazy(() =>
  import("./finance-trend").then((m) => ({ default: m.FinanceTrend })),
);
export function FinanceReadout({
  data,
  onFact,
  onObservation,
  native,
  busy,
}: {
  data: FinanceState;
  onFact: (v: Version<FactInput>) => void;
  onObservation: (v: Version<ObservationInput>) => void;
  native: boolean;
  busy: boolean;
}) {
  const [showPending, setShowPending] = useState(false);
  const [history, setHistory] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState("");
  const inRange = (date: string) =>
    (!from || date >= from) && (!to || date <= to);
  const facts = latestVersions(data.facts);
  const observations = latestVersions(data.observations);
  const choices = useMemo(() => {
    const m = new Map<
      string,
      {
        label: string;
        key: string;
        metric: string;
        context: string;
        kind: "fact" | "derived" | "custom";
        unit: string;
      }
    >();
    for (const r of latestVersions(data.facts)) {
      const ctx = contextKey(r.input);
      const key = `fact:${r.input.metric}:${ctx}`;
      m.set(key, {
        label: `${factNames[r.input.metric]} / ${r.input.currency || "币种未填"} ${r.input.unit || "单位未填"} / ${r.input.standard || "准则未填"} / ${r.input.scope || "范围未填"} / ${r.input.basis || "口径未填"} / ${r.input.period_kind}`,
        key,
        metric: r.input.metric,
        context: ctx,
        kind: "fact",
        unit: r.input.unit,
      });
    }
    for (const r of data.derived) {
      const ctx = contextKey(r.context);
      const key = `derived:${r.metric}:${ctx}`;
      m.set(key, {
        label: `${derivedNames[r.metric]} / ${r.context.currency} ${r.context.unit} / ${r.context.standard} / ${r.context.scope} / ${r.context.basis} / ${r.context.period_kind}`,
        key,
        metric: r.metric,
        context: ctx,
        kind: "derived",
        unit: r.metric === "fcf" ? r.context.unit : "比率（0.1 = 10%）",
      });
    }
    for (const d of data.definitions) {
      if (d.input.value_type === "number") {
        const key = `custom:${d.id}`;
        m.set(key, {
          label: `${d.input.name} / ${d.input.currency} ${d.input.unit} / ${d.input.basis || "口径未填"}`,
          key,
          metric: d.id,
          context: "",
          kind: "custom",
          unit: d.input.unit,
        });
      }
    }
    return [...m.values()];
  }, [data]);
  const choice = choices.find((c) => c.key === selected) ?? choices[0];
  const rows =
    choice?.kind === "fact"
      ? facts
          .filter(
            (r) =>
              r.input.metric === choice.metric &&
              contextKey(r.input) === choice.context,
          )
          .map((r) => ({
            date: r.input.period_end,
            value: completeContext(r.input) ? r.input.value : null,
            reviewed: r.input.reviewed,
          }))
      : choice?.kind === "derived"
        ? data.derived
            .filter(
              (r) =>
                r.metric === choice.metric &&
                contextKey(r.context) === choice.context,
            )
            .map((r) => ({
              date: r.context.period_end,
              value: r.value,
              reviewed: true,
            }))
        : observations
            .filter((r) => r.input.definition_id === choice?.metric)
            .map((r) => ({
              date: r.input.date,
              value: data.definitions.some(
                (d) =>
                  d.id === r.input.definition_id &&
                  completeObservationContext(d.input),
              )
                ? r.input.numeric_value
                : null,
              reviewed: r.input.reviewed,
            }));
  const dates = [
    ...new Set([
      ...rows.map((r) => r.date),
      ...(choice && choice.kind !== "custom"
        ? facts
            .filter((r) => contextKey(r.input) === choice.context)
            .map((r) => r.input.period_end)
        : []),
    ]),
  ]
    .sort()
    .filter(inRange);
  const values = buildSeries(rows, dates);
  const listedFacts = (history ? data.facts : facts).filter(
    (r) =>
      inRange(r.input.period_end) &&
      `${factNames[r.input.metric]} ${r.input.tags.join(" ")} ${r.input.source}`.includes(
        filter,
      ) &&
      (showPending || r.input.reviewed),
  );
  const listedObs = (history ? data.observations : observations).filter(
    (r) => inRange(r.input.date) && (showPending || r.input.reviewed),
  );
  return (
    <>
      <section className="panel">
        <h2>观测范围与趋势</h2>
        <div className="field-grid company-fields">
          <div>
            <label htmlFor="finance-from">起始日期（空表示不限）</label>
            <input
              id="finance-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="finance-to">结束日期（空表示不限）</label>
            <input
              id="finance-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="finance-series">数值指标与口径</label>
            <select
              id="finance-series"
              value={choice?.key ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">请选择或先录入数据</option>
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="finance-filter">原始事实科目/标签/来源筛选</label>
            <input
              id="finance-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={showPending}
              onChange={(e) => setShowPending(e.target.checked)}
            />
            显示待核值（灰显，不接入已核对线）
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={history}
              onChange={(e) => setHistory(e.target.checked)}
            />
            显示全部历史版本
          </label>
        </div>
        <p className="muted">
          仅同定义/同口径及相同月日跨度形成一条趋势；季度和累计跨度分开，不换汇、不换单位、不年化。自定义数值单位或口径未填时不进图（非金额币种可空）。显式缺值与重复候选留断点，无记录日期不推测。文本指标只在下方文本卡片展示。
        </p>
        {from && to && from > to ? (
          <p className="error">日期范围倒置，请调整。</p>
        ) : dates.length ? (
          <>
            <Suspense fallback={<p>加载本地趋势图…</p>}>
              <FinanceTrend
                labels={dates}
                reviewed={values.reviewed}
                pending={values.pending}
                showPending={showPending}
                unit={choice?.unit ?? ""}
              />
            </Suspense>
            <div className="finance-scroll">
              <table>
                <thead>
                  <tr>
                    <th>观测日期</th>
                    <th>已核对</th>
                    {showPending && <th>待核</th>}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d, i) => (
                    <tr key={d}>
                      <td>{d}</td>
                      <td>{displayNumber(values.reviewed[i])}</td>
                      {showPending && (
                        <td className="muted">
                          {displayNumber(values.pending[i])}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>所选范围暂无数值数据。缺值不会补0。</p>
        )}
      </section>
      <section className="panel">
        <h2>财务原始事实与修订</h2>
        <p className="muted">
          当前{facts.length}条事实链，待核
          {facts.filter((r) => !r.input.reviewed).length}
          条。原始内置项引用下面事实ID，不复制数值。最新版本待核时不回退到旧审核值。
        </p>
        {listedFacts.length === 0 ? (
          <p>当前视图无事实，可录入或切换待核视图。</p>
        ) : (
          <ul className="finance-records">
            {listedFacts.map((r) => (
              <li key={r.id} className={r.input.reviewed ? "" : "muted"}>
                <strong>
                  {factNames[r.input.metric]} / v{r.version} /{" "}
                  {displayNumber(r.input.value)} {r.input.currency}{" "}
                  {r.input.unit}
                </strong>
                <p>
                  {r.input.period_start ? `${r.input.period_start} 至 ` : ""}
                  {r.input.period_end} / {r.input.period_kind} /{" "}
                  {r.input.standard || "准则未填"} /{" "}
                  {r.input.scope || "范围未填"} / {r.input.basis || "口径未填"}
                </p>
                <p>
                  状态：{r.input.reviewed ? "已核对" : "待核"}；来源：
                  {r.input.source || "未填"}；标签：
                  {r.input.tags.join("、") || "无"}
                </p>
                <button
                  type="button"
                  disabled={
                    !native || busy || !facts.some((v) => v.id === r.id)
                  }
                  onClick={() => onFact(r)}
                >
                  修订数值 / 核对状态
                </button>
                {!completeContext(r.input) && (
                  <p>口径不全：不展示为内置指标。</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>固定派生指标</h2>
        <p className="muted">
          仅以已核对且口径完整的兼容事实计算；公式版本p06-v1，输入修订产生新快照。缺输入/待核/重复/分母0不展示数值。
        </p>
        {Object.keys(derivedNames).map((metric) => {
          const current = data.derived.filter(
            (d) => d.metric === metric && inRange(d.context.period_end),
          );
          return (
            <div key={metric}>
              <h3>{derivedNames[metric]}</h3>
              <p>{formulas[metric]}</p>
              {current.length ? (
                current.map((d) => (
                  <div key={d.id}>
                    <p>
                      <strong>
                        {d.value === null
                          ? "未展示"
                          : displayNumber(d.value, metric !== "fcf")}
                      </strong>{" "}
                      / {d.context.period_end} / {d.context.currency}{" "}
                      {metric === "fcf" ? d.context.unit : ""} /{" "}
                      {d.context.basis || "口径未填"}
                    </p>
                    {d.issue && <p className="muted">{d.issue}</p>}
                    <details>
                      <summary>输入来源与公式版本</summary>
                      <p>
                        公式{d.formula_version}；输入版本引用：
                        {d.input_ids
                          .map((id) => {
                            const r = data.facts.find((r) => r.id === id);
                            return r
                              ? `${factNames[r.input.metric]} v${r.version}`
                              : "未找到";
                          })
                          .join(" + ") || "缺输入"}
                      </p>
                    </details>
                  </div>
                ))
              ) : (
                <p className="muted">缺输入，未展示。</p>
              )}
            </div>
          );
        })}
        {history && (
          <details>
            <summary>
              只读派生快照历史（{data.derived_history.length}份）
            </summary>
            {data.derived_history
              .filter((d) => inRange(d.context.period_end))
              .map((d) => (
                <p key={d.id}>
                  {derivedNames[d.metric]} / {d.context.period_end} /{" "}
                  {displayNumber(d.value, d.metric !== "fcf")} / 公式
                  {d.formula_version} / 输入{" "}
                  {d.input_ids
                    .map((id) => {
                      const f = data.facts.find((f) => f.id === id);
                      return f
                        ? `${factNames[f.input.metric]} v${f.version}（${f.input.currency} ${f.input.unit} / ${f.input.basis}）`
                        : "未找到引用";
                    })
                    .join(" + ")}
                  （只读，不改写）
                </p>
              ))}
          </details>
        )}
      </section>
      <section className="panel">
        <h2>自定义观测与文本卡片</h2>
        <p className="muted">
          文本不会转换成数值或加入趋势。缺值保留，数值与单位来自选定定义。
        </p>
        {listedObs.length === 0 ? (
          <p>当前视图暂无观测。</p>
        ) : (
          <ul className="finance-records">
            {listedObs.map((r) => {
              const d = data.definitions.find(
                (d) => d.id === r.input.definition_id,
              );
              return (
                <li key={r.id} className={r.input.reviewed ? "" : "muted"}>
                  <h3>
                    {d?.input.name} / {r.input.date} / v{r.version}
                  </h3>
                  <p>
                    {d?.input.value_type === "text"
                      ? (r.input.text_value ?? "文本缺值")
                      : `${displayNumber(r.input.numeric_value)} ${d?.input.currency ?? ""} ${d?.input.unit ?? ""}`}
                  </p>
                  <p>
                    {d?.input.basis || "口径未填"}；
                    {r.input.reviewed ? "已核对" : "待核"}；来源
                    {r.input.source || "未填"}；{r.input.tags.join("、")}
                  </p>
                  <button
                    type="button"
                    disabled={
                      !native ||
                      busy ||
                      !observations.some((v) => v.id === r.id)
                    }
                    onClick={() => onObservation(r)}
                  >
                    修订观测 / 核对状态
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
