import { useEffect, useState } from "react";
import type { FactInput, Version } from "../../adapters/finance";
import { emptyFact, factNames, isInstant, tagInput } from "./finance-meta";
import { parseOptionalNumber } from "./finance-series";
export function FactForm({
  base,
  busy,
  native,
  onSave,
  onCancel,
}: {
  base: Version<FactInput> | null;
  busy: boolean;
  native: boolean;
  onSave: (input: FactInput, base: string | null) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [input, setInput] = useState<FactInput>(emptyFact);
  const [value, setValue] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setInput(base ? structuredClone(base.input) : structuredClone(emptyFact));
    setValue(base?.input.value?.toString() ?? "");
    setTags(base?.input.tags.join("，") ?? "");
    setError("");
  }, [base]);
  async function save() {
    try {
      setError("");
      const next = {
        ...input,
        value: parseOptionalNumber(value),
        tags: tagInput(tags),
      };
      if (await onSave(next, base?.id ?? null)) {
        setInput(structuredClone(emptyFact));
        setValue("");
        setTags("");
        onCancel();
      }
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="panel">
      <h2>
        {base
          ? `修订财务事实 v${base.version} → v${base.version + 1}`
          : "手工录入财务事实"}
      </h2>
      <p className="muted">
        空数值按缺值保存，不当作0。审核是你对录入与口径的确认，不代表外部审计。口径缺失可存档，但不进入内置指标。
      </p>
      {error && (
        <p role="alert" className="error">
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
          className="company-fields field-grid"
          disabled={busy || !native}
        >
          <div>
            <label htmlFor="fact-metric">原始科目</label>
            <select
              id="fact-metric"
              value={input.metric}
              disabled={!!base}
              onChange={(e) => {
                const metric = e.target.value;
                setInput({
                  ...input,
                  metric,
                  period_kind: isInstant(metric) ? "instant" : "annual",
                  period_start: "",
                });
              }}
            >
              {Object.entries(factNames).map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fact-value">数值（可留空）</label>
            <input
              id="fact-value"
              value={value}
              inputMode="decimal"
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="fact-currency">币种（例如CNY；不自动换汇）</label>
            <input
              id="fact-currency"
              value={input.currency}
              disabled={!!base}
              onChange={(e) => setInput({ ...input, currency: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="fact-unit">金额单位（例如元/万元）</label>
            <input
              id="fact-unit"
              value={input.unit}
              disabled={!!base}
              onChange={(e) => setInput({ ...input, unit: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="fact-period">期间类型</label>
            <select
              id="fact-period"
              value={input.period_kind}
              disabled={!!base || isInstant(input.metric)}
              onChange={(e) =>
                setInput({ ...input, period_kind: e.target.value })
              }
            >
              {isInstant(input.metric) ? (
                <option value="instant">期末时点</option>
              ) : (
                <>
                  <option value="annual">年度</option>
                  <option value="quarter">季度（非累计）</option>
                  <option value="ytd">年初累计</option>
                  <option value="custom">自定义期间</option>
                </>
              )}
            </select>
          </div>
          <div>
            <label htmlFor="fact-end">结束/期末日期</label>
            <input
              id="fact-end"
              type="date"
              required
              value={input.period_end}
              disabled={!!base}
              onChange={(e) =>
                setInput({ ...input, period_end: e.target.value })
              }
            />
          </div>
          {!isInstant(input.metric) && (
            <div>
              <label htmlFor="fact-start">期间开始日</label>
              <input
                id="fact-start"
                type="date"
                required
                value={input.period_start}
                disabled={!!base}
                onChange={(e) =>
                  setInput({ ...input, period_start: e.target.value })
                }
              />
            </div>
          )}
          <div>
            <label htmlFor="fact-standard">
              会计准则（例如CAS/IFRS/US GAAP）
            </label>
            <input
              id="fact-standard"
              disabled={!!base}
              value={input.standard}
              onChange={(e) => setInput({ ...input, standard: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="fact-scope">报表范围（合并/母公司等）</label>
            <input
              id="fact-scope"
              disabled={!!base}
              value={input.scope}
              onChange={(e) => setInput({ ...input, scope: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="fact-basis">口径说明（同批数据须一致）</label>
            <input
              id="fact-basis"
              disabled={!!base}
              value={input.basis}
              onChange={(e) => setInput({ ...input, basis: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="fact-source">
              来源/页码/字段（自行填写，不联网）
            </label>
            <input
              id="fact-source"
              value={input.source}
              onChange={(e) => setInput({ ...input, source: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="fact-tags">标签（逗号分隔）</label>
            <input
              id="fact-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={input.reviewed}
              onChange={(e) =>
                setInput({ ...input, reviewed: e.target.checked })
              }
            />
            已核对数值与口径
          </label>
        </fieldset>
        <div className="toolbar">
          <button type="submit" disabled={!native || busy}>
            {busy ? "保存中…" : base ? "追加修订版本" : "保存财务事实"}
          </button>
          {base && (
            <button type="button" disabled={busy} onClick={onCancel}>
              取消修订
            </button>
          )}
        </div>
      </form>
      {base && (
        <p className="muted">
          修订不改写旧版，也不改变科目/币种/期间/口径；需改变这些字段时新建独立事实。
        </p>
      )}
    </section>
  );
}
