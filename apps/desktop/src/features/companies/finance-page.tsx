import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createCompanyApi } from "../../adapters/companies";
import {
  createFinanceApi,
  type FactInput,
  type FinanceState,
  type ObservationInput,
  type Version,
} from "../../adapters/finance";
import { FactForm } from "./finance-fact-form";
import { ObservationForms } from "./finance-observation-form";
import { FinanceReadout } from "./finance-readout";

const api = createFinanceApi();
const companies = createCompanyApi();
const empty: FinanceState = {
  facts: [],
  definitions: [],
  observations: [],
  derived: [],
  derived_history: [],
};
export function FinancePage() {
  const { id = "" } = useParams();
  const native = isTauri();
  const [data, setData] = useState<FinanceState>(empty);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(native);
  const [factBase, setFactBase] = useState<Version<FactInput> | null>(null);
  const [obsBase, setObsBase] = useState<Version<ObservationInput> | null>(
    null,
  );
  useEffect(() => {
    if (!native) return;
    let active = true;
    setLoading(true);
    Promise.all([api.state(id), companies.get(id)])
      .then(([s, c]) => {
        if (active) {
          setData(s);
          setName(c.name);
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
  async function action(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      setNotice("已保存到本地SQLite；历史版本保持不变。");
      try {
        setData(await api.state(id));
      } catch (e) {
        setError(
          `写入已成功，但列表刷新失败：${String(e)}；重新打开页面核对，勿重复提交同一记录`,
        );
      }
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to={`/companies/${encodeURIComponent(id)}`}>返回公司档案</Link>
      <header>
        <h1>{name ? `${name}的财务与指标` : "手工财务与指标观测"}</h1>
        <p className="lead">
          原始数据保留口径，自定义观测保留判断线索。当前只手动录入，不联网采集、不接AI，不提供看板配置。
        </p>
      </header>
      {!native && (
        <p className="notice">
          浏览器只预览；本地财务与观测只在原生桌面中读写，不以假数据代替。
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}；输入仍保留，请核对后重试。
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p>读取本地财务数据…</p>
      ) : (
        <>
          <FactForm
            base={factBase}
            native={native}
            busy={busy}
            onCancel={() => setFactBase(null)}
            onSave={(input, base) =>
              action(() => api.saveFact(id, input, base))
            }
          />
          <ObservationForms
            base={obsBase}
            definitions={data.definitions}
            native={native}
            busy={busy}
            onDefine={(input) => action(() => api.define(id, input))}
            onObserve={(input, base) =>
              action(() => api.observe(id, input, base))
            }
            onCancel={() => setObsBase(null)}
          />
          <FinanceReadout
            data={data}
            native={native}
            busy={busy}
            onFact={(v) => {
              setFactBase(v);
              document
                .getElementById("fact-value")
                ?.scrollIntoView({ block: "center" });
            }}
            onObservation={(v) => {
              setObsBase(v);
              document
                .getElementById("observation-value")
                ?.scrollIntoView({ block: "center" });
            }}
          />
        </>
      )}
    </>
  );
}
