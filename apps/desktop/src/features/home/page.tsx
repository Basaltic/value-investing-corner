import { knowledgeMetadataSchema } from "@value-investing/content-schema";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getNativeInfo, type NativeInfo } from "../../adapters/native";

export function HomePage() {
  const [info, setInfo] = useState<NativeInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const metadataReady = knowledgeMetadataSchema.safeParse({ tags: [] }).success;
  useEffect(() => {
    let active = true;
    getNativeInfo().then((value) => {
      if (active) setInfo(value);
    });
    return () => {
      active = false;
    };
  }, []);
  async function checkConnection() {
    setChecking(true);
    setInfo(await getNativeInfo());
    setChecking(false);
  }
  return (
    <>
      <header>
        <p className="eyebrow">个人研究工作台</p>
        <h1>让思考留在自己的桌面。</h1>
      </header>
      <p className="lead">
        这是可独立迭代的桌面基础版本，界面与网站分开维护，共享稳定的计算和资料模型。
      </p>
      <section className="panel" aria-labelledby="runtime-title">
        <h2 id="runtime-title">运行环境</h2>
        <p role="status">
          {!info
            ? "正在检查原生连接…"
            : info.kind === "native"
              ? `${info.name} · ${info.version} · 原生连接正常`
              : info.kind === "browser"
                ? "浏览器预览：原生功能仅在 Tauri 窗口中可用。"
                : `原生连接失败：${info.message}`}
        </p>
        <button type="button" onClick={checkConnection} disabled={checking}>
          {checking ? "检查中…" : "重新检查连接"}
        </button>
      </section>
      <section className="panel" aria-labelledby="module-title">
        <h2 id="module-title">已接入的基础能力</h2>
        <ul>
          <li>估值计算：使用与网站相同的 DCF 算法。</li>
          <li>
            资料元数据：{metadataReady ? "共享校验模型已连接" : "模型校验失败"}
            。
          </li>
          <li>桌面窗口：原生应用信息查询与错误反馈。</li>
        </ul>
        <Link className="action-link" to="/valuation">
          打开估值工具
        </Link>
      </section>
      <p className="muted">
        已接入公司档案、本地资料库、个人判断历史、手工财务/指标观测、指标看板与来源/手动任务管理；具体自动采集适配器尚未接入。浏览器仅可预览界面，不会被标记为原生运行。
      </p>
    </>
  );
}
