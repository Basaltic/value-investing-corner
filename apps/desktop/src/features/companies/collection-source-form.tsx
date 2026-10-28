import { useEffect, useState } from "react";
import {
  createCollectionApi,
  type Source,
  type SourceInput,
} from "../../adapters/collection";

const api = createCollectionApi();
export const sourceNames: Record<string, string> = {
  sec_finance: "SEC 财务（后续P10）",
  sec_filings: "SEC 公告（后续P11）",
  gnews: "GNews 条件新闻（后续P12）",
};
export function SourceForm({
  source,
  native,
  onSaved,
}: {
  source: Source;
  native: boolean;
  onSaved: (s: Source) => void;
}) {
  const [input, setInput] = useState(source.input);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [secret, setSecret] = useState("");
  const [credential, setCredential] = useState<boolean | null>(null);
  const [credentialError, setCredentialError] = useState("");
  useEffect(() => {
    setInput(source.input);
  }, [source]);
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      onSaved(await api.saveSource(source.id, input, source.revision));
      setNotice(
        "登记已保存；这是本人填写的依据，不代表系统认证或适配器已接通。",
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function keyAction(kind: "status" | "save" | "remove") {
    setBusy(true);
    setCredentialError("");
    try {
      const status =
        kind === "status"
          ? await api.secretStatus(source.id)
          : kind === "save"
            ? await api.secretSave(source.id, secret)
            : await api.secretRemove(source.id);
      setCredential(status.configured);
      if (kind === "save") setSecret("");
    } catch (e) {
      setCredential(null);
      setCredentialError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function field<K extends keyof SourceInput>(key: K, value: SourceInput[K]) {
    setNotice("");
    setInput((old) => ({ ...old, [key]: value }));
  }
  return (
    <section className="panel material-fields">
      <h2>{sourceNames[source.id]}</h2>
      <p className="muted">
        登记v{source.revision}
        ；未注册实际采集适配器。开关只管理准入意愿，不会启动外部访问。SEC财务/公告共享最小配额与最大间隔。
      </p>
      {error && (
        <p className="error" role="alert">
          {error}；输入保留，请核对后重试。
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
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
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={input.enabled}
              onChange={(e) => field("enabled", e.target.checked)}
            />
            本人允许进入准入检查（默认关闭）
          </label>
          <div>
            <label htmlFor={`level-${source.id}`}>允许自动访问/存储等级</label>
            <select
              id={`level-${source.id}`}
              value={input.level}
              onChange={(e) =>
                field("level", e.target.value as SourceInput["level"])
              }
            >
              <option value="blocked">禁止/待核定</option>
              <option value="metadata">仅元数据（也须依据）</option>
              <option value="full">原文/结构化（须对应许可）</option>
            </select>
          </div>
          <div>
            <label htmlFor={`url-${source.id}`}>
              条款/披露说明 URL（不含参数/凭据）
            </label>
            <input
              id={`url-${source.id}`}
              value={input.evidence_url}
              maxLength={2000}
              onChange={(e) => field("evidence_url", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`evidence-${source.id}`}>
              具体许可依据摘录（不要输入密钥）
            </label>
            <textarea
              id={`evidence-${source.id}`}
              rows={3}
              value={input.evidence}
              maxLength={4000}
              onChange={(e) => field("evidence", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`purpose-${source.id}`}>本人用途与限制说明</label>
            <input
              id={`purpose-${source.id}`}
              maxLength={4000}
              value={input.purpose}
              onChange={(e) => field("purpose", e.target.value)}
            />
          </div>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={input.purpose_confirmed}
              onChange={(e) => field("purpose_confirmed", e.target.checked)}
            />
            本人已核对用途条件
          </label>
          <div>
            <label htmlFor={`limit-${source.id}`}>
              共享UTC日请求上限（1–100）
            </label>
            <input
              id={`limit-${source.id}`}
              type="number"
              min={1}
              max={100}
              value={input.daily_limit}
              onChange={(e) => field("daily_limit", Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor={`interval-${source.id}`}>
              最小间隔秒（1–86400）
            </label>
            <input
              id={`interval-${source.id}`}
              type="number"
              min={1}
              max={86400}
              value={input.min_interval_secs}
              onChange={(e) =>
                field("min_interval_secs", Number(e.target.value))
              }
            />
          </div>
        </fieldset>
        <button type="submit" disabled={!native || busy}>
          保存来源登记
        </button>
      </form>
      <p className="muted">
        无依据连元数据也不会请求；robots不是许可依据。登记恢复不代表来源启用许可仍有效，请重新核对。
      </p>
      {source.id === "gnews" && (
        <section>
          <h3>系统钥匙串凭据</h3>
          <p>
            状态：
            {credential === null
              ? "尚未检查/未知"
              : credential
                ? "已配置（不回显密钥）"
                : "未配置"}
            。只存当前应用系统Keychain，不进普通备份，不另建密钥备份。
          </p>
          {credentialError && (
            <p className="error" role="alert">
              {credentialError}
            </p>
          )}
          <label htmlFor="source-secret">自有密钥（只在此密码栏输入）</label>
          <input
            id="source-secret"
            type="password"
            autoComplete="off"
            maxLength={4096}
            value={secret}
            disabled={!native || busy}
            onChange={(e) => setSecret(e.target.value)}
          />
          <div className="toolbar">
            <button
              type="button"
              disabled={!native || busy}
              onClick={() => void keyAction("status")}
            >
              检查凭据状态
            </button>
            <button
              type="button"
              disabled={!native || busy || !secret.trim()}
              onClick={() => void keyAction("save")}
            >
              保存到系统钥匙串
            </button>
            <button
              type="button"
              disabled={!native || busy}
              onClick={() => void keyAction("remove")}
            >
              删除系统凭据
            </button>
          </div>
        </section>
      )}
    </section>
  );
}
