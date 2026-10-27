import { isTauri } from "@tauri-apps/api/core";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createCompanyApi } from "../../adapters/companies";
import {
  createJudgmentApi,
  type JudgmentState,
} from "../../adapters/judgments";

const DraftWorkspace = lazy(() =>
  import("./draft-workspace").then((m) => ({ default: m.DraftWorkspace })),
);
const JudgmentHistory = lazy(() =>
  import("./judgment-history").then((m) => ({ default: m.JudgmentHistory })),
);
const api = createJudgmentApi();
const companies = createCompanyApi();
export function JudgmentsPage() {
  const { id = "" } = useParams();
  const native = isTauri();
  const [name, setName] = useState("");
  const [data, setData] = useState<JudgmentState>({
    draft: null,
    versions: [],
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(native);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setData(await api.state(id));
  }, [id]);
  useEffect(() => {
    if (!native) return;
    let active = true;
    setLoading(true);
    Promise.all([companies.get(id), api.state(id)])
      .then(([c, state]) => {
        if (active) {
          setName(c.name);
          setData(state);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, native]);
  async function start(baseId: string | null) {
    setBusy(true);
    setError("");
    try {
      await api.start(id, baseId);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to={`/companies/${encodeURIComponent(id)}`}>返回公司档案</Link>
      <header>
        <h1>{name ? `${name}的个人判断` : "个人判断与历史"}</h1>
        <p className="lead">
          记录当时的认识，再回头看判断如何变化。自由正文优先，正式版本只追加，不被数据更新改写。
        </p>
      </header>
      {!native && (
        <p className="notice">
          浏览器只显示界面，不读取或保存判断；请在原生桌面窗口使用。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">读取本地判断…</p>
      ) : (
        <Suspense fallback={<p>载入判断编辑器…</p>}>
          {data.draft ? (
            <DraftWorkspace
              key={data.draft.id}
              draft={data.draft}
              onFrozen={() => void refresh().catch((e) => setError(String(e)))}
              onDiscarded={() =>
                void refresh().catch((e) => setError(String(e)))
              }
            />
          ) : (
            <section className="panel">
              <h2>开始书写</h2>
              <p>
                当前没有草稿；可新写一份，或从历史版本发起修订。无需填写固定提纲、评分或证据。
              </p>
              <button
                disabled={!native || busy}
                type="button"
                onClick={() => void start(null)}
              >
                新建自由判断草稿
              </button>
            </section>
          )}
          <JudgmentHistory
            versions={data.versions}
            disabled={busy || !!data.draft}
            onRevise={(base) => void start(base)}
          />
          {data.draft && (
            <p className="muted">
              当前有草稿，发起另一份修订前请先保存为正式版或明确删除草稿。
            </p>
          )}
        </Suspense>
      )}
    </>
  );
}
