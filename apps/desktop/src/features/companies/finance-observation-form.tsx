import { useEffect, useState } from "react";
import type {
  Definition,
  DefinitionInput,
  ObservationInput,
  Version,
} from "../../adapters/finance";
import { tagInput } from "./finance-meta";
import { parseOptionalNumber } from "./finance-series";
export function ObservationForms({
  definitions,
  base,
  native,
  busy,
  onDefine,
  onObserve,
  onCancel,
}: {
  definitions: Definition[];
  base: Version<ObservationInput> | null;
  native: boolean;
  busy: boolean;
  onDefine: (i: DefinitionInput) => Promise<boolean>;
  onObserve: (i: ObservationInput, base: string | null) => Promise<boolean>;
  onCancel: () => void;
}) {
  const empty: DefinitionInput = {
    name: "",
    value_type: "number",
    currency: "",
    unit: "",
    basis: "",
  };
  const [d, setD] = useState(empty);
  const [id, setId] = useState("");
  const [date, setDate] = useState("");
  const [value, setValue] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [source, setSource] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  const def = definitions.find((d) => d.id === id);
  useEffect(() => {
    setId(base?.input.definition_id ?? "");
    setDate(base?.input.date ?? "");
    setValue(
      base
        ? (base.input.numeric_value?.toString() ?? base.input.text_value ?? "")
        : "",
    );
    setReviewed(base?.input.reviewed ?? false);
    setSource(base?.input.source ?? "");
    setTags(base?.input.tags.join("，") ?? "");
  }, [base]);
  async function save() {
    try {
      setError("");
      if (!def) throw new Error("请先选择指标定义");
      const i: ObservationInput = {
        definition_id: id,
        date,
        numeric_value:
          def.input.value_type === "number" ? parseOptionalNumber(value) : null,
        text_value: def.input.value_type === "text" ? value || null : null,
        reviewed,
        source,
        tags: tagInput(tags),
      };
      if (await onObserve(i, base?.id ?? null)) {
        setValue("");
        onCancel();
      }
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <section className="panel">
        <h2>自定义指标定义</h2>
        <p className="muted">
          只记录本人输入的数值或文本，不参与内置公式。定义的类型、单位与口径创建后固定；变更时创建新定义。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onDefine(d).then((ok) => {
              if (ok) setD(empty);
            });
          }}
        >
          <fieldset
            disabled={!native || busy}
            className="company-fields field-grid"
          >
            <div>
              <label htmlFor="metric-name">指标名称</label>
              <input
                id="metric-name"
                required
                value={d.name}
                onChange={(e) => setD({ ...d, name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="metric-type">指标类型</label>
              <select
                id="metric-type"
                value={d.value_type}
                onChange={(e) =>
                  setD({
                    ...d,
                    value_type: e.target.value as "number" | "text",
                    unit: "",
                    currency: "",
                  })
                }
              >
                <option value="number">数值（可进趋势）</option>
                <option value="text">文本（仅卡片）</option>
              </select>
            </div>
            {d.value_type === "number" && (
              <>
                <div>
                  <label htmlFor="metric-unit">单位</label>
                  <input
                    id="metric-unit"
                    value={d.unit}
                    onChange={(e) => setD({ ...d, unit: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="metric-currency">币种（非金额可空）</label>
                  <input
                    id="metric-currency"
                    value={d.currency}
                    onChange={(e) => setD({ ...d, currency: e.target.value })}
                  />
                </div>
              </>
            )}
            <div>
              <label htmlFor="metric-basis">指标口径</label>
              <input
                id="metric-basis"
                value={d.basis}
                onChange={(e) => setD({ ...d, basis: e.target.value })}
              />
            </div>
          </fieldset>
          <button type="submit" disabled={!native || busy}>
            创建指标定义
          </button>
        </form>
      </section>
      <section className="panel">
        <h2>{base ? `追加观测修订 v${base.version + 1}` : "记录一次观测"}</h2>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset
            disabled={!native || busy}
            className="company-fields field-grid"
          >
            <div>
              <label htmlFor="observation-definition">指标定义</label>
              <select
                id="observation-definition"
                required
                disabled={!!base}
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setValue("");
                }}
              >
                <option value="">请选择</option>
                {definitions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.input.name} /{" "}
                    {d.input.value_type === "number" ? "数值" : "文本"} /{" "}
                    {d.input.unit || "无单位"} / {d.input.basis || "口径未填"}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="observation-date">观测日期</label>
              <input
                id="observation-date"
                required
                disabled={!!base}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="observation-value">
                {def?.input.value_type === "text" ? "文本内容" : "数值"}
                （留空表示缺值）
              </label>
              <textarea
                id="observation-value"
                rows={3}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="observation-source">来源/个人备注</label>
              <input
                id="observation-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="observation-tags">标签（逗号分隔）</label>
              <input
                id="observation-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              已核对观测
            </label>
          </fieldset>
          <div className="toolbar">
            <button type="submit" disabled={!native || busy || !def}>
              {base ? "追加观测修订" : "保存观测"}
            </button>
            {base && (
              <button type="button" disabled={busy} onClick={onCancel}>
                取消修订
              </button>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
