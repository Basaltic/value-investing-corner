import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  type CollectionEvent,
  type CollectionRun,
  createCollectionApi,
  type Source,
} from "../../adapters/collection";
import { type Company, createCompanyApi } from "../../adapters/companies";
import { SourceForm, sourceNames } from "./collection-source-form";

const api = createCollectionApi();
const companiesApi = createCompanyApi();
const states: Record<string, string> = {
  queued: "排队",
  running: "运行中",
  succeeded: "成功",
  failed: "失败",
  skipped: "跳过",
};
export function CollectionPage() {
  const native = isTauri();
  const [sources, setSources] = useState<Source[]>([]);
  const [runs, setRuns] = useState<CollectionRun[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState("");
  const [source, setSource] = useState("sec_finance");
  const [requestKey, setRequestKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<Record<string, CollectionEvent[]>>({});
  useEffect(() => {
    if (!native) return;
    let active = true;
    Promise.all([api.sources(), api.runs(), companiesApi.list("")])
      .then(([s, r, c]) => {
        if (active) {
          setSources(s);
          setRuns(r);
          setCompanies(c);
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [native]);
  async function action(fn: () => Promise<CollectionRun>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      setRuns((old) => [result, ...old.filter((r) => r.id !== result.id)]);
      setNotice(
        `任务${states[result.state]}：${result.reason || "尚未执行外部访问"}`,
      );
      try {
        setRuns(await api.runs());
      } catch {
        setError("任务已写入，但列表刷新失败，请重新载入，不要重复请求。");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      setRuns(await api.runs());
      setError("");
      setHistory({});
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <header>
        <h1>来源与采集任务</h1>
        <p className="lead">
          先登记许可和用途，再检查凭据与任务。当前只提供手动通道，没有实际外部采集适配器；不默认启用任何来源。
        </p>
      </header>
      {!native && (
        <p className="notice">
          浏览器只预览，来源登记、任务与系统凭据只能在原生桌面管理。
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {sources.map((s) => (
        <SourceForm
          key={s.id}
          source={s}
          native={native}
          onSaved={(value) =>
            setSources((old) => old.map((s) => (s.id === value.id ? value : s)))
          }
        />
      ))}
      <section className="panel">
        <h2>一次手动任务</h2>
        <p>
          相同公司/来源/请求标识只创建一个任务。明确的新研究请求才换标识；失败重试共最多3次执行，不绕过来源配额。不自动调度、不在关机/退出后运行。
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(() => api.enqueue(company, source, requestKey));
          }}
        >
          <fieldset
            disabled={!native || busy}
            className="company-fields field-grid"
          >
            <div>
              <label htmlFor="collection-company">公司</label>
              <select
                id="collection-company"
                required
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="">请选择公司</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="collection-source">来源通道</label>
              <select
                id="collection-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                {Object.entries(sourceNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="collection-key">
                请求标识（字母/数字/-/_，不填凭据）
              </label>
              <input
                id="collection-key"
                required
                maxLength={100}
                pattern="[A-Za-z0-9_-]+"
                value={requestKey}
                onChange={(e) => setRequestKey(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setRequestKey(crypto.randomUUID())}
              >
                生成新请求标识
              </button>
            </div>
          </fieldset>
          <button
            type="submit"
            disabled={!native || busy || !company || !requestKey}
          >
            加入手动队列
          </button>
        </form>
        {!companies.length && (
          <p>
            先<Link to="/companies">创建公司档案</Link>；不制造示例公司。
          </p>
        )}
      </section>
      <section className="panel">
        <h2>统一任务记录</h2>
        <button
          type="button"
          disabled={!native || busy}
          onClick={() => void reload()}
        >
          重新载入任务
        </button>
        {!runs.length ? (
          <p>尚无手动任务。跳过不等于成功归档，失败不自动重试。</p>
        ) : (
          <ul className="finance-records">
            {runs.map((r) => (
              <li key={r.id}>
                <h3>
                  {companies.find((c) => c.id === r.company_id)?.name ||
                    "公司引用未找到"}{" "}
                  / {sourceNames[r.source_id]}
                </h3>
                <p>
                  状态：{states[r.state]}；尝试 {r.attempts}/3；请求标识{" "}
                  {r.request_key}
                </p>
                <p>
                  原因：{r.reason || "尚未执行"}；创建 {r.created_at}；更新{" "}
                  {r.updated_at}
                </p>
                <div className="toolbar">
                  <button
                    type="button"
                    disabled={busy || r.state !== "queued"}
                    onClick={() => void action(() => api.execute(r.id))}
                  >
                    执行一次准入检查
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !["failed", "skipped"].includes(r.state) ||
                      r.attempts >= 3
                    }
                    onClick={() => void action(() => api.retry(r.id))}
                  >
                    重试回队列
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void api
                        .events(r.id)
                        .then((events) =>
                          setHistory((old) => ({ ...old, [r.id]: events })),
                        )
                        .catch((e) => setError(String(e)))
                    }
                  >
                    查看状态历史
                  </button>
                </div>
                {history[r.id] && (
                  <ol>
                    {history[r.id].map((e) => (
                      <li key={e.sequence}>
                        {e.created_at} / {states[e.state]} / 尝试{e.attempt} /{" "}
                        {e.reason || "无错误原因"}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
