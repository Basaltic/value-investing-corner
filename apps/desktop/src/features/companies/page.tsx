import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  type Company,
  type CompanyInput,
  type CompanyMarket,
  createCompanyApi,
  type DuplicateWarning,
  type ListingInput,
  type ListingMarket,
} from "../../adapters/companies";

const api = createCompanyApi();
const marketNames: Record<CompanyMarket, string> = {
  a: "A 股",
  hk: "港股",
  us: "美股",
  private: "非上市",
};
const emptyCompany: CompanyInput = {
  name: "",
  market: "private",
  registration: "",
  listings: [],
};
const emptyListing: ListingInput = {
  market: "a",
  code: "",
  exchange: "",
  security_type: "普通股",
};
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function BrowserNotice() {
  return (
    <p className="notice">
      浏览器预览：可查看界面，本地档案读写仅在 Tauri
      桌面窗口中可用。不使用浏览器存储替代数据库。
    </p>
  );
}
function DuplicateNotice({
  warnings,
  confirm,
  cancel,
  busy,
}: {
  warnings: DuplicateWarning[];
  confirm: () => void;
  cancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="panel duplicate-notice" role="alert">
      <h2>发现重复信息，请先核对</h2>
      <ul>
        {warnings.map((warning) => (
          <li key={`${warning.company_id}-${warning.message}`}>
            {warning.company_name}：{warning.message}
            {warning.company_id && (
              <>
                {" "}
                <Link
                  to={`/companies/${encodeURIComponent(warning.company_id)}`}
                >
                  查看已有档案
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <p>继续保存会创建独立记录，不会合并已有公司或证券。</p>
      <div className="toolbar">
        <button type="button" disabled={busy} onClick={confirm}>
          确认仍然保存
        </button>
        <button type="button" disabled={busy} onClick={cancel}>
          取消本次保存
        </button>
      </div>
    </div>
  );
}
function ListingFields({
  value,
  set,
  disabled,
}: {
  value: ListingInput;
  set: (next: ListingInput) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="field-grid company-fields">
      <div>
        <label htmlFor="listing-market">证券市场</label>
        <select
          id="listing-market"
          value={value.market}
          onChange={(event) =>
            set({ ...value, market: event.target.value as ListingMarket })
          }
        >
          {(["a", "hk", "us"] as const).map((market) => (
            <option key={market} value={market}>
              {marketNames[market]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="listing-code">证券代码（必填）</label>
        <input
          id="listing-code"
          value={value.code}
          maxLength={64}
          required
          onChange={(event) => set({ ...value, code: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="listing-exchange">交易所（可选）</label>
        <input
          id="listing-exchange"
          value={value.exchange}
          maxLength={100}
          onChange={(event) => set({ ...value, exchange: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor="listing-type">证券类型</label>
        <select
          id="listing-type"
          value={value.security_type}
          onChange={(event) =>
            set({ ...value, security_type: event.target.value })
          }
        >
          <option>普通股</option>
          <option>A 股</option>
          <option>H 股</option>
          <option>ADR</option>
          <option>其他</option>
        </select>
      </div>
    </fieldset>
  );
}

export function CompaniesPage() {
  const native = isTauri();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [query, setQuery] = useState("");
  const [input, setInput] = useState<CompanyInput>(emptyCompany);
  const [addInitial, setAddInitial] = useState(false);
  const [listing, setListing] = useState<ListingInput>(emptyListing);
  const [loading, setLoading] = useState(native);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [pendingInput, setPendingInput] = useState<CompanyInput | null>(null);
  useEffect(() => {
    if (!native) return;
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(
      () =>
        api
          .list(query)
          .then((rows) => {
            if (active) {
              setCompanies(rows);
              setError("");
            }
          })
          .catch((failure) => {
            if (active) setError(errorText(failure));
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      180,
    );
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [native, query]);
  async function save(candidate: CompanyInput, confirmed: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.create(candidate, confirmed);
      if (result.kind === "needs_confirmation") {
        setWarnings(result.warnings);
        setPendingInput(candidate);
        return;
      }
      setWarnings([]);
      setPendingInput(null);
      setInput(emptyCompany);
      setListing(emptyListing);
      setAddInitial(false);
      setCompanies(await api.list(query));
      setNotice(`已创建「${result.record.name}」的独立公司档案。`);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || pendingInput !== null;
  return (
    <>
      <header>
        <p className="eyebrow">本地研究档案</p>
        <h1>公司研究</h1>
        <p className="lead">
          从一份公司档案开始。名称与证券代码分开保存；跨市场证券可以挂在同一家公司下。
        </p>
      </header>
      {!native && <BrowserNotice />}
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
      <section className="panel" aria-labelledby="company-create-title">
        <h2 id="company-create-title">新建公司</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(
              { ...input, listings: addInitial ? [listing] : [] },
              false,
            );
          }}
        >
          <fieldset
            disabled={locked || !native}
            className="field-grid company-fields"
          >
            <div>
              <label htmlFor="company-name">公司名称（必填）</label>
              <input
                id="company-name"
                required
                maxLength={200}
                value={input.name}
                onChange={(event) =>
                  setInput({ ...input, name: event.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="company-market">公司分类</label>
              <select
                id="company-market"
                value={input.market}
                onChange={(event) =>
                  setInput({
                    ...input,
                    market: event.target.value as CompanyMarket,
                  })
                }
              >
                {Object.entries(marketNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="company-registration">注册地（可选）</label>
              <input
                id="company-registration"
                maxLength={200}
                value={input.registration}
                onChange={(event) =>
                  setInput({ ...input, registration: event.target.value })
                }
              />
            </div>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={addInitial}
                onChange={(event) => setAddInitial(event.target.checked)}
              />
              同时添加第一条证券（可选）
            </label>
          </fieldset>
          {addInitial && (
            <ListingFields
              value={listing}
              set={setListing}
              disabled={locked || !native}
            />
          )}
          <div className="toolbar">
            <button type="submit" disabled={locked || !native}>
              {busy ? "保存中…" : "创建公司档案"}
            </button>
          </div>
        </form>
        {pendingInput && (
          <DuplicateNotice
            warnings={warnings}
            busy={busy}
            confirm={() => {
              void save(pendingInput, true);
            }}
            cancel={() => {
              setPendingInput(null);
              setWarnings([]);
            }}
          />
        )}
      </section>
      <section aria-labelledby="company-list-title">
        <div className="company-section-heading">
          <h2 id="company-list-title">我的公司</h2>
          <span className="muted">{companies.length} 份档案</span>
        </div>
        <label htmlFor="company-search">搜索公司名称或证券代码</label>
        <input
          id="company-search"
          type="search"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          disabled={!native}
        />
        {loading ? (
          <p role="status">正在读取本地档案…</p>
        ) : companies.length === 0 ? (
          <p className="panel muted">
            {!native
              ? "请在桌面窗口中查看本地公司档案。"
              : query
                ? "没有匹配的公司，可调整名称或证券代码再搜索。"
                : "尚无公司档案。先填写上方名称即可建档，证券和注册地可以不填。"}
          </p>
        ) : (
          <ul className="company-list">
            {companies.map((company) => (
              <li key={company.id}>
                <Link
                  to={`/companies/${encodeURIComponent(company.id)}`}
                  className="company-card"
                >
                  <strong>{company.name}</strong>
                  <span className="muted">
                    {marketNames[company.market]}
                    {company.registration ? ` · ${company.registration}` : ""}
                  </span>
                  <span>
                    {company.listings.length
                      ? company.listings
                          .map(
                            (row) => `${marketNames[row.market]} ${row.code}`,
                          )
                          .join(" / ")
                      : "尚未添加证券"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export function CompanyDetailPage() {
  const { id = "" } = useParams();
  const native = isTauri();
  const [company, setCompany] = useState<Company | null>(null);
  const [input, setInput] = useState<ListingInput>(emptyListing);
  const [pending, setPending] = useState<ListingInput | null>(null);
  const [warnings, setWarnings] = useState<DuplicateWarning[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(native);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!native) return;
    let active = true;
    setLoading(true);
    setCompany(null);
    setPending(null);
    setWarnings([]);
    setNotice("");
    api
      .get(id)
      .then((result) => {
        if (active) {
          setCompany(result);
          setError("");
        }
      })
      .catch((failure) => {
        if (active) setError(errorText(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, native]);
  async function save(candidate: ListingInput, confirmed: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await api.addListing(id, candidate, confirmed);
      if (result.kind === "needs_confirmation") {
        setPending(candidate);
        setWarnings(result.warnings);
        return;
      }
      setCompany(await api.get(id));
      setPending(null);
      setWarnings([]);
      setInput(emptyListing);
      setNotice("证券已添加，已有公司与证券未被合并。");
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link to="/companies">返回公司列表</Link>
      {!native && <BrowserNotice />}
      {loading && <p role="status">正在读取公司档案…</p>}
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
      {company && (
        <>
          <header>
            <h1>{company.name}</h1>
            <p className="lead">
              {marketNames[company.market]} ·{" "}
              {company.registration || "注册地未填写"} · 创建于{" "}
              {new Date(company.created_at).toLocaleString("zh-CN")}
            </p>
          </header>
          <Link
            className="action-link"
            to={`/companies/${encodeURIComponent(id)}/materials`}
          >
            打开公司资料库
          </Link>
          <section className="panel">
            <h2>证券档案</h2>
            <p className="muted">
              A 股、H 股、ADR 等证券分别登记，不用代码充当公司身份。
            </p>
            {company.listings.length === 0 ? (
              <p>尚未添加证券；非上市公司可以保持为空。</p>
            ) : (
              <ul className="company-list">
                {company.listings.map((row) => (
                  <li className="listing-row" key={row.id}>
                    <strong>
                      {marketNames[row.market]} {row.code}
                    </strong>
                    <span>
                      {row.exchange || "交易所未填写"} ·{" "}
                      {row.security_type || "证券类型未填写"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel">
            <h2>添加证券</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save(input, false);
              }}
            >
              <ListingFields
                value={input}
                set={setInput}
                disabled={busy || pending !== null}
              />
              <div className="toolbar">
                <button type="submit" disabled={busy || pending !== null}>
                  {busy ? "保存中…" : "添加证券"}
                </button>
              </div>
            </form>
            {pending && (
              <DuplicateNotice
                warnings={warnings}
                busy={busy}
                confirm={() => {
                  void save(pending, true);
                }}
                cancel={() => {
                  setPending(null);
                  setWarnings([]);
                }}
              />
            )}
          </section>
          <p className="muted">
            本阶段只管理公司和证券档案；资料、判断、指标与自动采集将在后续经确认的阶段接入。
          </p>
        </>
      )}
    </>
  );
}
