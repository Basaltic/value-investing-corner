import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";

GlobalWorkerOptions.workerSrc = workerUrl;
export function PdfPreview({ bytes }: { bytes: number[] }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    let active = true;
    setPdf(null);
    setError("");
    setPage(1);
    const task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: false,
      standardFontDataUrl: new URL(
        `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
        window.location.href.split("#")[0],
      ).href,
      cMapUrl: new URL(
        `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
        window.location.href.split("#")[0],
      ).href,
      cMapPacked: true,
    });
    task.promise
      .then((doc) => {
        if (active) setPdf(doc);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      void task.destroy();
    };
  }, [bytes]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let rendering: { cancel: () => void } | null = null;
    setText("");
    pdf
      .getPage(page)
      .then(async (p) => {
        if (!active || !canvas.current) return;
        const viewport = p.getViewport({
          scale: Math.min(1.4, 700 / p.getViewport({ scale: 1 }).width),
        });
        const target = canvas.current;
        const context = target.getContext("2d");
        if (!context) throw new Error("画布不可用");
        target.width = viewport.width;
        target.height = viewport.height;
        const task = p.render({ canvasContext: context, viewport });
        rendering = task;
        await task.promise;
        const content = await p.getTextContent();
        if (active)
          setText(
            content.items
              .map((item) => ("str" in item ? item.str : ""))
              .join(" "),
          );
      })
      .catch((e) => {
        if (active && e?.name !== "RenderingCancelledException")
          setError(String(e));
      });
    return () => {
      active = false;
      rendering?.cancel();
    };
  }, [pdf, page]);
  return (
    <div className="pdf-preview">
      {error ? (
        <p className="error" role="alert">
          PDF预览失败（损坏或受密码保护）：{error}
        </p>
      ) : (
        <>
          <div className="toolbar">
            <button
              type="button"
              disabled={!pdf || page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </button>
            <span>{pdf ? `${page} / ${pdf.numPages} 页` : "正在读取PDF…"}</span>
            <button
              type="button"
              disabled={!pdf || page === pdf.numPages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </button>
          </div>
          <canvas ref={canvas} aria-label={`PDF第${page}页`} />
          <details>
            <summary>本页文字（可复制）</summary>
            <p>{text || "该页无可提取文字，扫描件不做OCR。"}</p>
          </details>
        </>
      )}
    </div>
  );
}
