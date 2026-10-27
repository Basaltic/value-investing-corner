import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
  DashboardCard,
  ItemInput,
  ResearchItem,
} from "../../adapters/dashboard";
import { createDashboardApi } from "../../adapters/dashboard";
import { createFinanceApi, type FinanceState } from "../../adapters/finance";
import { createJudgmentApi, type Judgment } from "../../adapters/judgments";
import { createMaterialApi, type Material } from "../../adapters/materials";
import { DashboardMetric } from "./dashboard-metric";
import { metricChoices, metricView } from "./dashboard-model";

const api = createDashboardApi();
const finance = createFinanceApi();
const materials = createMaterialApi();
const judgments = createJudgmentApi();
const names = {
  metric: "指标",
  reading: "待读资料",
  supplement: "待补数据",
  judgment: "最近正式判断",
};
export function CompanyDashboard({
  companyId,
  cards,
  editing,
  onChange,
  onMove,
  onRemove,
  onAdd,
}: {
  companyId: string;
  cards: DashboardCard[];
  editing: boolean;
  onChange: (c: DashboardCard) => void;
  onMove: (id: string, direction: number) => void;
  onRemove: (id: string) => void;
  onAdd: (kind: DashboardCard["kind"]) => void;
}) {
  const [data, setData] = useState<FinanceState | null>(null);
  const [mats, setMats] = useState<Material[]>([]);
  const [versions, setVersions] = useState<Judgment[]>([]);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [materialId, setMaterialId] = useState("");
  const [body, setBody] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setErrors({});
    function receive<T>(key: string, p: Promise<T>, set: (v: T) => void) {
      void p
        .then((v) => {
          if (active) set(v);
        })
        .catch((e) => {
          if (active) setErrors((old) => ({ ...old, [key]: String(e) }));
        });
    }
    receive("finance", finance.state(companyId), setData);
    receive("materials", materials.list(companyId, "", false), setMats);
    receive(
      "judgments",
      judgments.state(companyId).then((s) => s.versions),
      setVersions,
    );
    receive("items", api.items(companyId), setItems);
    return () => {
      active = false;
    };
  }, [companyId]);
  async function put(input: ItemInput) {
    setBusy(true);
    try {
      const item = await api.putItem(companyId, input);
      setItems((old) => [...old.filter((i) => i.id !== item.id), item]);
      setErrors((e) => ({ ...e, items: "" }));
      if (!input.id) {
        setBody("");
        setMaterialId("");
      }
      try {
        setItems(await api.items(companyId));
      } catch (e) {
        setErrors((old) => ({
          ...old,
          items: `事项已保存但列表刷新失败：${String(e)}；重新载入核对，勿重复添加`,
        }));
      }
    } catch (e) {
      setErrors((old) => ({ ...old, items: String(e) }));
    } finally {
      setBusy(false);
    }
  }
  const latest = versions.reduce<Judgment | null>(
    (old, v) => (!old || (v.version ?? 0) > (old.version ?? 0) ? v : old),
    null,
  );
  return (
    <>
      {editing && (
        <div className="toolbar">
          {(Object.keys(names) as DashboardCard["kind"][]).map((kind) => (
            <button key={kind} type="button" onClick={() => onAdd(kind)}>
              添加{names[kind]}卡
            </button>
          ))}
        </div>
      )}
      {editing && (
        <p className="muted">
          卡片配置需点击页面上方“保存看板配置”；待读/待补事项立即单独保存，移除卡片不删除事项。
        </p>
      )}
      <div className="dashboard-cards">
        {cards
          .filter((c) => editing || c.visible)
          .map((card, index) => (
            <article className="panel dashboard-card" key={card.id}>
              <h3>{names[card.kind]}</h3>
              {editing && (
                <>
                  <div className="toolbar">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={card.visible}
                        onChange={(e) =>
                          onChange({ ...card, visible: e.target.checked })
                        }
                      />
                      显示卡片
                    </label>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMove(card.id, -1)}
                    >
                      上移卡片
                    </button>
                    <button
                      type="button"
                      disabled={index === cards.length - 1}
                      onClick={() => onMove(card.id, 1)}
                    >
                      下移卡片
                    </button>
                    <button type="button" onClick={() => onRemove(card.id)}>
                      移除卡片
                    </button>
                  </div>
                  {card.kind === "metric" && (
                    <div className="company-fields field-grid">
                      <div>
                        <label htmlFor={`metric-${card.id}`}>
                          所选指标及口径
                        </label>
                        <select
                          id={`metric-${card.id}`}
                          value={
                            card.selection ? JSON.stringify(card.selection) : ""
                          }
                          onChange={(e) =>
                            onChange({
                              ...card,
                              selection: e.target.value
                                ? JSON.parse(e.target.value)
                                : null,
                            })
                          }
                        >
                          <option value="">请选择</option>
                          {card.selection && (
                            <option value={JSON.stringify(card.selection)}>
                              已保存选择（可继续使用原始口径）
                            </option>
                          )}
                          {data &&
                            metricChoices(data).map((c) => (
                              <option
                                value={JSON.stringify(c.selection)}
                                key={JSON.stringify(c.selection)}
                              >
                                {c.label}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`from-${card.id}`}>
                          起始日期（空不限）
                        </label>
                        <input
                          id={`from-${card.id}`}
                          type="date"
                          value={card.from}
                          onChange={(e) =>
                            onChange({ ...card, from: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label htmlFor={`to-${card.id}`}>
                          结束日期（空不限）
                        </label>
                        <input
                          id={`to-${card.id}`}
                          type="date"
                          value={card.to}
                          onChange={(e) =>
                            onChange({ ...card, to: e.target.value })
                          }
                        />
                      </div>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={card.show_pending}
                          onChange={(e) =>
                            onChange({
                              ...card,
                              show_pending: e.target.checked,
                            })
                          }
                        />
                        显示待核（灰显，数值不连线）
                      </label>
                    </div>
                  )}
                </>
              )}
              {card.kind === "metric" ? (
                errors.finance ? (
                  <p className="error">指标读取失败：{errors.finance}</p>
                ) : data ? (
                  <DashboardMetric card={card} data={data} />
                ) : (
                  <p>读取本地指标…</p>
                )
              ) : card.kind === "judgment" ? (
                errors.judgments ? (
                  <p className="error">判断读取失败：{errors.judgments}</p>
                ) : latest ? (
                  <>
                    <p>
                      正式 v{latest.version} / {latest.updated_at}
                    </p>
                    <p className="material-text">{latest.text}</p>
                    <Link to={`/companies/${companyId}/judgments`}>
                      查看完整判断与历史
                    </Link>
                  </>
                ) : (
                  <p>
                    尚无正式判断，
                    <Link to={`/companies/${companyId}/judgments`}>
                      写下判断
                    </Link>
                    。不以草稿冒充正式版。
                  </p>
                )
              ) : (
                <>
                  {errors.items && (
                    <p className="error">
                      事项读取/保存失败：{errors.items}
                      ；输入保留，请重新载入核对。
                    </p>
                  )}
                  {card.kind === "reading" && errors.materials && (
                    <p className="error">资料读取失败：{errors.materials}</p>
                  )}
                  {card.kind === "supplement" && data && (
                    <div>
                      <h4>已选指标的数据缺口（不是自动任务）</h4>
                      {cards
                        .filter((c) => c.kind === "metric" && c.visible)
                        .map((c) => {
                          const v = metricView(data, c.selection, c.from, c.to);
                          const missing =
                            v.type === "empty" ||
                            v.issue ||
                            v.reviewed.some((n) => n === null);
                          return missing ? (
                            <p key={c.id}>
                              {v.label || "未选指标"}：
                              {v.issue ||
                                "部分期间缺值/待核/重复候选，请在财务页核对。"}
                            </p>
                          ) : null;
                        })}
                    </div>
                  )}
                  <ul>
                    {items
                      .filter((i) => i.kind === card.kind)
                      .map((i) => {
                        const m = mats.find((m) => m.id === i.material_id);
                        return (
                          <li key={i.id}>
                            <label className="checkbox-field">
                              <input
                                type="checkbox"
                                disabled={busy}
                                checked={i.done}
                                onChange={(e) =>
                                  void put({
                                    id: i.id,
                                    kind: i.kind,
                                    material_id: i.material_id,
                                    text: i.text,
                                    done: e.target.checked,
                                    expected_revision: i.revision,
                                  })
                                }
                              />
                              {i.kind === "reading"
                                ? (m?.title ?? "资料已归档/不可读（状态保留）")
                                : i.text}{" "}
                              — {i.done ? "已完成" : "待处理"}
                            </label>
                          </li>
                        );
                      })}
                  </ul>
                  {!items.some((i) => i.kind === card.kind && !i.done) && (
                    <p>
                      暂无{card.kind === "reading" ? "待读" : "待补"}
                      事项，不自动制造任务。
                    </p>
                  )}
                  {card.kind === "reading" ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void put({
                          id: null,
                          kind: "reading",
                          material_id: materialId,
                          text: "",
                          done: false,
                          expected_revision: 0,
                        });
                      }}
                    >
                      <label htmlFor={`reading-${card.id}`}>
                        显式标记一份资料待读
                      </label>
                      <select
                        id={`reading-${card.id}`}
                        value={materialId}
                        className="dashboard-select"
                        onChange={(e) => setMaterialId(e.target.value)}
                      >
                        <option value="">请选择未归档资料</option>
                        {mats
                          .filter(
                            (m) => !items.some((i) => i.material_id === m.id),
                          )
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.title}
                            </option>
                          ))}
                      </select>
                      <button type="submit" disabled={busy || !materialId}>
                        加入待读
                      </button>
                      <p>
                        <Link to={`/companies/${companyId}/materials`}>
                          打开资料库
                        </Link>
                      </p>
                    </form>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void put({
                          id: null,
                          kind: "supplement",
                          material_id: null,
                          text: body,
                          done: false,
                          expected_revision: 0,
                        });
                      }}
                    >
                      <label htmlFor={`supplement-${card.id}`}>
                        个人待补事项
                      </label>
                      <input
                        id={`supplement-${card.id}`}
                        maxLength={5000}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                      />
                      <button type="submit" disabled={busy || !body.trim()}>
                        添加待补事项
                      </button>
                      <p>
                        <Link to={`/companies/${companyId}/finance`}>
                          核对财务与观测缺口
                        </Link>
                        ；待补内容由你填写，不用AI生成。
                      </p>
                    </form>
                  )}
                </>
              )}
            </article>
          ))}
      </div>
      {!cards.length && (
        <p>
          尚无卡片，选择“编辑看板”添加模板。
          <Link to={`/companies/${companyId}/finance`}>录入指标</Link>。
        </p>
      )}
    </>
  );
}
