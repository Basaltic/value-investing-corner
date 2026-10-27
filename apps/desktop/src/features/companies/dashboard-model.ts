import type { DashboardGroup, MetricSelection } from "../../adapters/dashboard";
import type { FinanceState } from "../../adapters/finance";
import {
  completeContext,
  completeObservationContext,
  contextKey,
  derivedNames,
  factNames,
} from "./finance-meta";
import { buildSeries, latestVersions } from "./finance-series";
export type MetricChoice = { label: string; selection: MetricSelection };
export type MetricView = {
  type: "number" | "text" | "empty";
  labels: string[];
  reviewed: (number | null)[];
  pending: (number | null)[];
  texts: {
    id: string;
    date: string;
    value: string | null;
    reviewed: boolean;
  }[];
  unit: string;
  label: string;
  issue: string;
  percent: boolean;
};
export function metricChoices(data: FinanceState): MetricChoice[] {
  const out = new Map<string, MetricChoice>();
  for (const f of latestVersions(data.facts)) {
    const key = `fact:${f.input.metric}:${contextKey(f.input)}`;
    out.set(key, {
      label: `${factNames[f.input.metric]} / ${f.input.currency || "币种未填"} ${f.input.unit || "单位未填"} / ${f.input.standard} / ${f.input.scope} / ${f.input.basis || "口径未填"} / ${f.input.period_kind} ${f.input.period_start.slice(5)}—${f.input.period_end.slice(5)}`,
      selection: { kind: "fact", metric: f.input.metric, anchor_id: f.id },
    });
  }
  for (const d of data.derived) {
    const anchor = data.facts.find(
      (f) =>
        f.input.currency === d.context.currency &&
        contextKey(f.input) === contextKey(d.context),
    );
    if (anchor)
      out.set(`derived:${d.metric}:${contextKey(d.context)}`, {
        label: `${derivedNames[d.metric]} / ${d.context.currency} ${d.context.unit} / ${d.context.standard} / ${d.context.scope} / ${d.context.basis} / ${d.context.period_kind} ${d.context.period_start.slice(5)}—${d.context.period_end.slice(5)}`,
        selection: { kind: "derived", metric: d.metric, anchor_id: anchor.id },
      });
  }
  for (const d of data.definitions)
    out.set(`custom:${d.id}`, {
      label: `${d.input.name} / ${d.input.value_type === "text" ? "文本" : `${d.input.currency} ${d.input.unit}`} / ${d.input.basis || "口径未填"}`,
      selection: { kind: "custom", metric: d.id, anchor_id: d.id },
    });
  return [...out.values()];
}
export function metricView(
  data: FinanceState,
  selection: MetricSelection | null,
  from: string,
  to: string,
): MetricView {
  const empty: MetricView = {
    type: "empty",
    labels: [],
    reviewed: [],
    pending: [],
    texts: [],
    unit: "",
    label: "",
    issue: "尚未选择指标或引用已失效，请重新配置",
    percent: false,
  };
  if (!selection) return empty;
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  let rows: { date: string; value: number | null; reviewed: boolean }[] = [];
  let axis: string[] = [];
  let label = "";
  let unit = "";
  let issue = "";
  let percent = false;
  if (selection.kind === "custom") {
    const d = data.definitions.find((d) => d.id === selection.anchor_id);
    if (!d) return empty;
    label = d.input.name;
    unit = `${d.input.currency} ${d.input.unit}`.trim();
    const obs = latestVersions(data.observations).filter(
      (o) => o.input.definition_id === d.id && inRange(o.input.date),
    );
    if (d.input.value_type === "text")
      return {
        ...empty,
        type: "text",
        label,
        issue: "",
        texts: obs.map((o) => ({
          id: o.id,
          date: o.input.date,
          value: o.input.text_value,
          reviewed: o.input.reviewed,
        })),
      };
    rows = obs.map((o) => ({
      date: o.input.date,
      value: completeObservationContext(d.input) ? o.input.numeric_value : null,
      reviewed: o.input.reviewed,
    }));
    if (!completeObservationContext(d.input))
      issue = "单位或口径未填写，不展示指标数值";
  } else {
    const anchor = data.facts.find((f) => f.id === selection.anchor_id);
    if (!anchor) return empty;
    const ctx = contextKey(anchor.input);
    const facts = latestVersions(data.facts).filter(
      (f) => contextKey(f.input) === ctx,
    );
    axis = facts.map((f) => f.input.period_end);
    if (selection.kind === "fact") {
      if (anchor.input.metric !== selection.metric) return empty;
      label = factNames[selection.metric];
      unit = `${anchor.input.currency} ${anchor.input.unit}`.trim();
      rows = facts
        .filter((f) => f.input.metric === selection.metric)
        .map((f) => ({
          date: f.input.period_end,
          value: completeContext(f.input) ? f.input.value : null,
          reviewed: f.input.reviewed,
        }));
      if (!completeContext(anchor.input))
        issue = "币种/单位/准则/范围/口径缺失，未展示数值";
    } else {
      label = derivedNames[selection.metric];
      if (!label) return empty;
      percent = selection.metric !== "fcf";
      unit = percent
        ? "比率（0.1 = 10%）"
        : `${anchor.input.currency} ${anchor.input.unit}`;
      const derived = data.derived.filter(
        (d) => d.metric === selection.metric && contextKey(d.context) === ctx,
      );
      rows = derived.map((d) => ({
        date: d.context.period_end,
        value: d.value,
        reviewed: true,
      }));
      issue = derived
        .filter((d) => d.issue)
        .map((d) => `${d.context.period_end}：${d.issue}`)
        .join("；");
    }
  }
  const labels = [...new Set([...axis, ...rows.map((r) => r.date)])]
    .filter(inRange)
    .sort();
  const series = buildSeries(rows, labels);
  return {
    type: "number",
    labels,
    reviewed: series.reviewed,
    pending: series.pending,
    texts: [],
    unit,
    label,
    issue,
    percent,
  };
}
export function groupedCompanies<T extends { id: string }>(
  companies: T[],
  groups: DashboardGroup[],
): { id: string; name: string; companies: T[] }[] {
  const used = new Set<string>();
  const out = groups.map((g) => ({
    id: g.id,
    name: g.name,
    companies: g.company_ids.flatMap((id) => {
      const c = companies.find((c) => c.id === id);
      if (!c || used.has(id)) return [];
      used.add(id);
      return [c];
    }),
  }));
  return [
    ...out,
    {
      id: "",
      name: "未分组",
      companies: companies.filter((c) => !used.has(c.id)),
    },
  ];
}
