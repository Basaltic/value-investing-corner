import { diffLines } from "diff";
import { useMemo, useState } from "react";
import type { Judgment } from "../../adapters/judgments";
import { JudgmentEditor } from "./judgment-editor";
export function JudgmentHistory({
  versions,
  onRevise,
  disabled,
}: {
  versions: Judgment[];
  onRevise: (id: string) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState("");
  const [compare, setCompare] = useState("");
  const current = versions.find((v) => v.id === selected) ?? versions[0];
  const prior =
    versions.find((v) => v.id === compare && v.id !== current?.id) ??
    versions.find((v) => v.id !== current?.id);
  const differences = useMemo(
    () =>
      current && prior
        ? diffLines(prior.text, current.text).map((part) => ({
            ...part,
            id: crypto.randomUUID(),
          }))
        : [],
    [current, prior],
  );
  return (
    <section className="panel">
      <h2>正式判断历史</h2>
      <p className="muted">
        时间线按正式版本从新到旧排列。旧版只读；修订会复制成草稿，不覆盖历史。
      </p>
      {versions.length === 0 ? (
        <p>
          尚无正式判断；先写自由正文，再明确转为正式版本。未附证据不会阻止保存。
        </p>
      ) : (
        <>
          <ol className="judgment-timeline">
            {versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  aria-pressed={current?.id === v.id}
                  onClick={() => setSelected(v.id)}
                >
                  v{v.version} /{" "}
                  {new Date(v.updated_at).toLocaleString("zh-CN")}
                </button>
                <span>
                  {v.reason ? `修订原因：${v.reason}` : "未填写修订原因"}
                  ；未附证据
                </span>
              </li>
            ))}
          </ol>
          {current && (
            <>
              <h3>v{current.version} 正式判断（只读）</h3>
              <button
                disabled={disabled}
                type="button"
                onClick={() => onRevise(current.id)}
              >
                从该版本发起修订
              </button>
              <JudgmentEditor
                key={current.id}
                document={current.document}
                editable={false}
              />
              {prior && (
                <>
                  <h3>版本差异</h3>
                  <label htmlFor="judgment-compare">基准正式版本</label>
                  <select
                    id="judgment-compare"
                    value={prior.id}
                    onChange={(e) => setCompare(e.target.value)}
                  >
                    {versions
                      .filter((v) => v.id !== current.id)
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          v{v.version}
                        </option>
                      ))}
                  </select>
                  <p>
                    比较 v{prior.version} → v{current.version}
                    （正文按行，格式变化另行查看原版）。
                  </p>
                  <div className="judgment-diff">
                    {differences.map((part) => (
                      <pre
                        key={part.id}
                        className={
                          part.added
                            ? "diff-added"
                            : part.removed
                              ? "diff-removed"
                              : ""
                        }
                      >
                        <span>
                          {part.added
                            ? "新增："
                            : part.removed
                              ? "删除："
                              : "保留："}
                        </span>
                        {part.value}
                      </pre>
                    ))}
                  </div>
                  <p>
                    修订原因：{prior.reason || "未填"} →{" "}
                    {current.reason || "未填"}
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
