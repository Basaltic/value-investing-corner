import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Link, useBlocker } from "react-router-dom";
import { type Company, createCompanyApi } from "../../adapters/companies";
import {
  createDashboardApi,
  type DashboardCard,
  type DashboardConfig,
  type DashboardSaved,
} from "../../adapters/dashboard";
import { CompanyDashboard } from "./dashboard-company";
import { groupedCompanies } from "./dashboard-model";

const api = createDashboardApi();
const companiesApi = createCompanyApi();
const empty: DashboardConfig = { groups: [], cards: [] };
function move<T>(rows: T[], index: number, direction: number): T[] {
  const next = [...rows];
  const target = index + direction;
  if (index < 0 || target < 0 || target >= rows.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function DashboardPage() {
  const native = isTauri();
  const [saved, setSaved] = useState<DashboardSaved>({
    revision: 0,
    config: empty,
  });
  const [config, setConfig] = useState<DashboardConfig>(empty);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(native);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ready, setReady] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [reloadEpoch, setReloadEpoch] = useState(0);
  const dirty = JSON.stringify(config) !== JSON.stringify(saved.config);
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (!native) return;
    let active = true;
    Promise.all([api.load(), companiesApi.list("")])
      .then(([s, c]) => {
        if (active) {
          setSaved(s);
          setConfig(structuredClone(s.config));
          setCompanies(c);
          setReady(true);
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
  }, [native]);
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const s = await api.save(config, saved.revision);
      setSaved(s);
      setConfig(structuredClone(s.config));
      setNotice("看板配置已保存到本地SQLite。");
      setEditing(false);
    } catch (e) {
      setError(`${String(e)}；本次配置输入保留，未覆盖已保存配置。`);
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      const [s, c] = await Promise.all([api.load(), companiesApi.list("")]);
      setSaved(s);
      setConfig(structuredClone(s.config));
      setCompanies(c);
      setReady(true);
      setError("");
      setNotice("已载入保存配置，放弃本次未保存修改。");
      setReloadEpoch((v) => v + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function add(company_id: string, kind: DashboardCard["kind"]) {
    setConfig((c) => ({
      ...c,
      cards: [
        ...c.cards,
        {
          id: crypto.randomUUID(),
          company_id,
          kind,
          visible: true,
          selection: null,
          from: "",
          to: "",
          show_pending: false,
        },
      ],
    }));
  }
  function assign(companyId: string, groupId: string) {
    setConfig((c) => ({
      ...c,
      groups: c.groups.map((g) => ({
        ...g,
        company_ids:
          g.id === groupId
            ? [...g.company_ids.filter((id) => id !== companyId), companyId]
            : g.company_ids.filter((id) => id !== companyId),
      })),
    }));
  }
  return (
    <>
      <header>
        <h1>指标看板</h1>
        <p className="lead">
          把需要持续核对的指标、资料和个人判断放在一起。只用本地数据，没有自动采集或AI内容。
        </p>
      </header>
      {!native && (
        <p className="notice">
          浏览器仅可预览；看板配置和研究数据只在原生桌面读取保存，不提供模拟公司。
        </p>
      )}
      {blocker.state === "blocked" && (
        <section className="notice" role="alert">
          <p>看板有未保存修改。离开会丢失本次配置修改。</p>
          <button type="button" onClick={() => blocker.reset()}>
            留在看板
          </button>
          <button type="button" onClick={() => blocker.proceed()}>
            放弃修改并离开
          </button>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="toolbar">
        <button
          type="button"
          disabled={!native || busy || !ready}
          onClick={() => setEditing(!editing)}
        >
          {editing ? "收起配置" : "编辑看板"}
        </button>
        <button
          type="button"
          disabled={!native || busy || !ready || !dirty}
          onClick={() => void save()}
        >
          保存看板配置
        </button>
        <button
          type="button"
          disabled={!native || busy}
          onClick={() => void reload()}
        >
          重新载入（放弃配置修改）
        </button>
        <span className="muted">
          {dirty ? "配置尚未保存" : `已保存配置 v${saved.revision}`}
          ；关闭应用前请保存。
        </span>
      </div>
      {editing && !busy && (
        <section className="panel">
          <h2>公司分组</h2>
          <p className="muted">
            每家公司最多在一个自定义组。没有分组的新公司显示在“未分组”；移除组不删除公司。
          </p>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              if (!groupName.trim()) return;
              setConfig((c) => ({
                ...c,
                groups: [
                  ...c.groups,
                  { id: crypto.randomUUID(), name: groupName, company_ids: [] },
                ],
              }));
              setGroupName("");
            }}
          >
            <label htmlFor="dashboard-group-name">新分组名称</label>
            <input
              id="dashboard-group-name"
              maxLength={200}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <button type="submit" disabled={busy || !groupName.trim()}>
              添加分组
            </button>
          </form>
          {config.groups.map((g, index) => (
            <div key={g.id} className="toolbar">
              <label htmlFor={`name-${g.id}`}>分组名称</label>
              <input
                id={`name-${g.id}`}
                maxLength={200}
                value={g.name}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    groups: c.groups.map((old) =>
                      old.id === g.id ? { ...old, name: e.target.value } : old,
                    ),
                  }))
                }
              />
              <button
                type="button"
                disabled={index === 0}
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    groups: move(c.groups, index, -1),
                  }))
                }
              >
                上移分组
              </button>
              <button
                type="button"
                disabled={index === config.groups.length - 1}
                onClick={() =>
                  setConfig((c) => ({ ...c, groups: move(c.groups, index, 1) }))
                }
              >
                下移分组
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfig((c) => ({
                    ...c,
                    groups: c.groups.filter((old) => old.id !== g.id),
                  }))
                }
              >
                移除分组
              </button>
            </div>
          ))}
        </section>
      )}
      {loading ? (
        <p>读取本地看板…</p>
      ) : companies.length === 0 ? (
        <section className="panel">
          <h2>从公司档案开始</h2>
          <p>
            没有公司时不制造推荐内容。<Link to="/companies">创建公司档案</Link>
            后添加指标和卡片。
          </p>
        </section>
      ) : (
        groupedCompanies(companies, config.groups).map((group) => (
          <section key={group.id} className="dashboard-group">
            <h2>{group.name}</h2>
            {!group.companies.length && <p className="muted">组内暂无公司。</p>}
            {group.companies.map((company, index) => (
              <div className="dashboard-company" key={company.id}>
                <div className="company-section-heading">
                  <h3>
                    <Link to={`/companies/${company.id}`}>{company.name}</Link>
                  </h3>
                  {editing && !busy && (
                    <div className="toolbar">
                      <label htmlFor={`group-${company.id}`}>所在分组</label>
                      <select
                        id={`group-${company.id}`}
                        className="dashboard-select"
                        value={group.id}
                        onChange={(e) => assign(company.id, e.target.value)}
                      >
                        <option value="">未分组</option>
                        {config.groups.map((g) => (
                          <option value={g.id} key={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                      {group.id && (
                        <>
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() =>
                              setConfig((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === group.id
                                    ? {
                                        ...g,
                                        company_ids: move(
                                          g.company_ids,
                                          index,
                                          -1,
                                        ),
                                      }
                                    : g,
                                ),
                              }))
                            }
                          >
                            上移公司
                          </button>
                          <button
                            type="button"
                            disabled={index === group.companies.length - 1}
                            onClick={() =>
                              setConfig((c) => ({
                                ...c,
                                groups: c.groups.map((g) =>
                                  g.id === group.id
                                    ? {
                                        ...g,
                                        company_ids: move(
                                          g.company_ids,
                                          index,
                                          1,
                                        ),
                                      }
                                    : g,
                                ),
                              }))
                            }
                          >
                            下移公司
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <CompanyDashboard
                  key={`${company.id}:${reloadEpoch}`}
                  companyId={company.id}
                  cards={config.cards.filter(
                    (c) => c.company_id === company.id,
                  )}
                  editing={editing && !busy}
                  onAdd={(kind) => add(company.id, kind)}
                  onRemove={(id) =>
                    setConfig((c) => ({
                      ...c,
                      cards: c.cards.filter((r) => r.id !== id),
                    }))
                  }
                  onChange={(card) =>
                    setConfig((c) => ({
                      ...c,
                      cards: c.cards.map((r) => (r.id === card.id ? card : r)),
                    }))
                  }
                  onMove={(id, direction) =>
                    setConfig((c) => {
                      const own = c.cards.filter(
                        (r) => r.company_id === company.id,
                      );
                      const changed = move(
                        own,
                        own.findIndex((r) => r.id === id),
                        direction,
                      );
                      let at = 0;
                      return {
                        ...c,
                        cards: c.cards.map((r) =>
                          r.company_id === company.id ? changed[at++] : r,
                        ),
                      };
                    })
                  }
                />
              </div>
            ))}
          </section>
        ))
      )}
    </>
  );
}
