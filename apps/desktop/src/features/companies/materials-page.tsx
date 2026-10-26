import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { createCompanyApi } from "../../adapters/companies";
import {
  createMaterialApi,
  type Material,
  type MaterialInput,
  type MaterialPreview,
} from "../../adapters/materials";
import { MaterialViewer } from "./material-preview";

const api = createMaterialApi();
const companies = createCompanyApi();
const empty: MaterialInput = { title: "", body: "", url: "", tags: [] };
const kindNames = { note: "文本笔记", link: "来源链接", file: "本地文件" };
export function MaterialsPage() {
  const { id = "" } = useParams();
  const native = isTauri();
  const [company, setCompany] = useState("");
  const [rows, setRows] = useState<Material[]>([]);
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [input, setInput] = useState<MaterialInput>(empty);
  const [tags, setTags] = useState("");
  const [kind, setKind] = useState<"note" | "link" | "file">("note");
  const [mode, setMode] = useState<"copy" | "reference">("copy");
  const [selected, setSelected] = useState<Material | null>(null);
  const [editing, setEditing] = useState<Material | null>(null);
  const [preview, setPreview] = useState<MaterialPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(native);
  useEffect(() => {
    if (!native) return;
    let active = true;
    companies
      .get(id)
      .then((c) => {
        if (active) setCompany(c.name);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [id, native]);
  useEffect(() => {
    if (!native) return;
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .list(id, query, archived)
        .then((list) => {
          if (active) setRows(list);
        })
        .catch((e) => {
          if (active) setError(String(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, native, query, archived]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setPreview(null);
    api
      .preview(selected.id)
      .then((p) => {
        if (active) setPreview(p);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [selected]);
  async function refresh() {
    setRows(await api.list(id, query, archived));
  }
  function reset() {
    setEditing(null);
    setInput(empty);
    setTags("");
  }
  async function save() {
    setBusy(true);
    setError("");
    setNotice("");
    const data = {
      ...input,
      tags: tags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    };
    try {
      const result = editing
        ? await api.update(editing.id, data)
        : kind === "file"
          ? await api.importFile(id, mode, data)
          : await api.create(id, kind, data);
      if (!result) {
        setNotice("已取消文件选择，未新增资料，输入保留。");
        return;
      }
      reset();
      setSelected(result);
      await refresh();
      setNotice(editing ? "资料更改已保存。" : "资料已添加到本地资料库。");
    } catch (e) {
      setError(`${String(e)}；输入已保留，可修改后重试。`);
    } finally {
      setBusy(false);
    }
  }
  async function action(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await operation();
      await refresh();
      setNotice(success);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(row: Material) {
    setEditing(row);
    setKind(row.kind);
    setInput({
      title: row.title,
      body: row.body,
      url: row.url,
      tags: row.tags,
    });
    setTags(row.tags.join(", "));
  }
  return (
    <>
      <Link to={`/companies/${encodeURIComponent(id)}`}>返回公司档案</Link>
      <header>
        <h1>{company ? `${company}的资料库` : "公司资料库"}</h1>
        <p className="lead">
          文件、来源链接和文本笔记各自归档。本地检索标签与标题，不上传内容、不自动抓取。
        </p>
      </header>
      {!native && (
        <p className="notice">
          浏览器仅预览界面。资料库读写、文件选择和本地预览仅在 Tauri
          桌面窗口可用。
        </p>
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
      <section className="panel">
        <h2>{editing ? "编辑资料" : "添加资料"}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset
            disabled={!native || busy}
            className="company-fields material-fields"
          >
            {!editing && (
              <fieldset
                className="toolbar company-fields"
                aria-label="资料类型"
              >
                {(["note", "link", "file"] as const).map((k) => (
                  <button
                    type="button"
                    key={k}
                    aria-pressed={kind === k}
                    onClick={() => setKind(k)}
                  >
                    {kindNames[k]}
                  </button>
                ))}
              </fieldset>
            )}
            <label htmlFor="material-title">资料标题（必填）</label>
            <input
              id="material-title"
              value={input.title}
              required
              maxLength={200}
              onChange={(e) => setInput({ ...input, title: e.target.value })}
            />
            <label htmlFor="material-tags">标签（逗号分隔）</label>
            <input
              id="material-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="例如：财报, 护城河"
            />
            <label htmlFor="material-url">
              来源链接{kind === "link" ? "（必填）" : "（可选）"}
            </label>
            <input
              id="material-url"
              type="url"
              required={kind === "link"}
              value={input.url}
              maxLength={4000}
              placeholder="https://…"
              onChange={(e) => setInput({ ...input, url: e.target.value })}
            />
            <label htmlFor="material-body">
              {kind === "note"
                ? "笔记正文（支持Markdown）"
                : "资料说明（可选）"}
            </label>
            <textarea
              id="material-body"
              value={input.body}
              maxLength={1000000}
              rows={6}
              onChange={(e) => setInput({ ...input, body: e.target.value })}
            />
            {!editing && kind === "file" && (
              <>
                <label htmlFor="material-mode">原件去向</label>
                <select
                  id="material-mode"
                  value={mode}
                  onChange={(e) =>
                    setMode(e.target.value as "copy" | "reference")
                  }
                >
                  <option value="copy">内部复制（推荐；原件移动仍可读）</option>
                  <option value="reference">
                    外部引用（原件失效需重新定位）
                  </option>
                </select>
                <p className="muted">
                  保存时打开原生选择框，单个文件上限50 MiB，内嵌预览上限20
                  MiB。复制文件进入备份；外部引用仅备份位置、不包含原件。请仅添加有权留存的资料。
                </p>
              </>
            )}
            <div className="toolbar">
              <button type="submit">
                {busy
                  ? "保存中…"
                  : editing
                    ? "保存资料更改"
                    : kind === "file"
                      ? "选择文件并保存资料"
                      : "保存资料"}
              </button>
              {editing && (
                <button type="button" onClick={reset}>
                  取消编辑
                </button>
              )}
            </div>
          </fieldset>
        </form>
      </section>
      <section>
        <div className="company-section-heading">
          <h2>资料清单</h2>
          <span className="muted">{rows.length}条</span>
        </div>
        <div className="toolbar">
          <button
            disabled={!native || busy}
            type="button"
            aria-pressed={!archived}
            onClick={() => setArchived(false)}
          >
            在用资料
          </button>
          <button
            disabled={!native || busy}
            type="button"
            aria-pressed={archived}
            onClick={() => setArchived(true)}
          >
            已归档
          </button>
        </div>
        <label htmlFor="material-search">搜索标题或标签</label>
        <input
          id="material-search"
          type="search"
          disabled={!native}
          value={query}
          maxLength={200}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading ? (
          <p role="status">读取本地资料…</p>
        ) : rows.length === 0 ? (
          <p className="panel muted">
            {!native
              ? "请在桌面窗口中查看公司资料。"
              : query
                ? "没有匹配资料，请调整搜索词。"
                : archived
                  ? "暂无已归档资料。"
                  : "暂无资料。可先添加一段笔记或一份文件。"}
          </p>
        ) : (
          <ul className="company-list">
            {rows.map((row) => (
              <li className="listing-row" key={row.id}>
                <strong>{row.title}</strong>
                <span className="muted">
                  {kindNames[row.kind]}
                  {row.kind === "file"
                    ? ` / ${row.file_mode === "copy" ? "内部复制" : "外部引用"} / ${row.original_name} / ${row.file_size.toLocaleString()} bytes`
                    : ""}
                </span>
                <span>{row.tags.join(" / ") || "未设置标签"}</span>
                <div className="toolbar">
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => {
                      setError("");
                      setSelected(row);
                    }}
                  >
                    查看资料
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => edit(row)}
                  >
                    编辑
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() =>
                      void action(
                        async () => {
                          await api.archive(row.id, !row.archived);
                          if (selected?.id === row.id) setSelected(null);
                        },
                        row.archived
                          ? "资料已恢复为在用。"
                          : "资料已归档，没有删除文件。",
                      )
                    }
                  >
                    {row.archived ? "恢复在用" : "归档"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <section className="panel" aria-label="资料预览">
          <div className="company-section-heading">
            <h2>{selected.title}</h2>
            <button type="button" onClick={() => setSelected(null)}>
              关闭预览
            </button>
          </div>
          <p className="muted">
            创建：{new Date(selected.created_at).toLocaleString("zh-CN")}
            ；修改：{new Date(selected.updated_at).toLocaleString("zh-CN")}
          </p>
          <div className="toolbar">
            {selected.url && (
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void action(
                    () => api.openSource(selected.id),
                    "来源链接已交由系统浏览器打开。",
                  )
                }
              >
                在系统浏览器打开来源
              </button>
            )}
            {selected.kind === "file" && (
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void action(
                    () => api.reveal(selected.id),
                    "已在访达显示资料文件。",
                  )
                }
              >
                在访达显示文件
              </button>
            )}
            {selected.file_mode === "reference" && (
              <button
                disabled={busy}
                type="button"
                onClick={() =>
                  void action(async () => {
                    const row = await api.relocate(selected.id);
                    if (row) setSelected(row);
                  }, "重定位操作已结束；只有同内容文件可以替换位置。")
                }
              >
                重新定位
              </button>
            )}
          </div>
          {preview ? (
            <MaterialViewer
              material={selected}
              preview={preview}
              onChange={(m) => {
                setSelected(m);
                void refresh();
              }}
            />
          ) : (
            <p role="status">正在读取预览；失败原因显示在页面顶部。</p>
          )}
        </section>
      )}
    </>
  );
}
