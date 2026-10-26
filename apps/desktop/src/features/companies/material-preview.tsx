import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import Markdown from "react-markdown";
import {
  createMaterialApi,
  type Material,
  type MaterialPreview,
} from "../../adapters/materials";

const PdfPreview = lazy(() =>
  import("./pdf-preview").then((module) => ({ default: module.PdfPreview })),
);

const api = createMaterialApi();
function ImagePreview({ preview }: { preview: MaterialPreview }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(preview.bytes)], { type: preview.mime }),
    );
    setUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  return url ? (
    <img className="material-image" src={url} alt="本地资料原图" />
  ) : (
    <p>正在读取图片…</p>
  );
}
export function MaterialViewer({
  material,
  preview,
  onChange,
}: {
  material: Material;
  preview: MaterialPreview;
  onChange: (m: Material) => void;
}) {
  const [mapping, setMapping] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const columns = useMemo(
    () =>
      preview.headers.map((header, index) => ({
        id: crypto.randomUUID(),
        header,
        index,
      })),
    [preview],
  );
  const tableRows = useMemo(
    () =>
      preview.rows.map((row) => ({
        id: crypto.randomUUID(),
        cells: row.map((value) => ({ id: crypto.randomUUID(), value })),
      })),
    [preview],
  );
  useEffect(() => {
    setMapping(
      material.csv_mapping.length
        ? material.csv_mapping
        : preview.headers.map(() => ""),
    );
    setError("");
  }, [material, preview]);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      onChange(await api.mapping(material.id, mapping));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (preview.status === "missing")
    return (
      <p className="error">
        文件已失效。外部引用请使用“重新定位”，复制文件请检查附件或从备份恢复。
      </p>
    );
  if (preview.status === "changed")
    return (
      <p className="error">
        文件内容已改变，未作为原资料采用。请恢复原件或将新内容作为新资料导入。
      </p>
    );
  if (preview.kind === "pdf")
    return (
      <Suspense fallback={<p>加载本地PDF查看器…</p>}>
        <PdfPreview bytes={preview.bytes} />
      </Suspense>
    );
  if (preview.kind === "image") return <ImagePreview preview={preview} />;
  if (preview.kind === "csv")
    return (
      <>
        <p className="muted">
          CSV资料，共{preview.total_rows}
          行；只预览前100行，最多100列。各值保留为文本，不转换前导零或执行公式。不写入财务与指标。
        </p>
        <p>
          {material.csv_mapping.length
            ? "已确认列映射，可调整后重新确认。"
            : "尚未确认列映射，未作为结构化资料采用。"}
        </p>
        <fieldset disabled={busy} className="company-fields field-grid">
          {columns.map(({ header, index: i, id }) => (
            <label key={id}>
              第{i + 1}列「{header || "空表头"}」映射名称（留空忽略）
              <input
                value={mapping[i] ?? ""}
                maxLength={60}
                onChange={(e) =>
                  setMapping(
                    mapping.map((v, n) => (n === i ? e.target.value : v)),
                  )
                }
              />
            </label>
          ))}
        </fieldset>
        <button type="button" disabled={busy} onClick={() => void confirm()}>
          确认列映射
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="csv-scroll">
          <table>
            <thead>
              <tr>
                {columns.map(({ header: h, index: i, id }) => (
                  <th key={id}>{h || `第${i + 1}列`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell) => (
                    <td key={cell.id}>{cell.value || "（空）"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (preview.kind === "unsupported")
    return (
      <p>
        本期不支持此格式预览，保留元数据与文件位置。可在访达显示后自行选用合适软件。
      </p>
    );
  if (preview.kind === "text")
    return <pre className="material-text">{preview.text}</pre>;
  return (
    <div className="material-markdown">
      <Markdown
        skipHtml
        components={{
          img: () => <span>［外链图片不自动加载］</span>,
          a: ({ children }) => (
            <span>{children}［链接不自动打开，请登记来源链接］</span>
          ),
        }}
      >
        {preview.text}
      </Markdown>
    </div>
  );
}
