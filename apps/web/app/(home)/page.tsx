import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { knowledgeRoute, thesesRoute, toolsRoute } from "@/lib/shared";

export default function HomePage() {
  return (
    <main className="site-paper relative flex flex-1 flex-col overflow-hidden">
      <div className="site-hero-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="site-noise pointer-events-none absolute -right-56 -top-60 size-[42rem] rounded-full blur-3xl" />

      <section className="relative mx-auto w-full max-w-6xl px-6 pb-20 pt-20 md:px-10 md:pb-28 md:pt-28">
        <div className="grid items-end gap-14 lg:grid-cols-[1fr_18rem]">
          <div>
            <p className="site-forest mb-8 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em]">
              <span className="h-px w-10 bg-[var(--forest)] opacity-60" />
              Value Investing Corner · Long-term thinking
            </p>
            <h1 className="site-serif max-w-4xl text-[clamp(3.2rem,8vw,7.4rem)] font-medium leading-[0.98] tracking-[-0.055em]">
              在噪声之外，
              <br />
              <span className="site-forest">寻找长期的价值。</span>
            </h1>
            <p className="site-muted mt-9 max-w-2xl text-base leading-8 md:text-lg">
              收集值得反复阅读的投资资料，也记录关于企业、市场与自我的理性思考。
              这里不追逐短期答案，只沉淀可以穿越周期的问题。
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href={thesesRoute}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-transform hover:-translate-y-0.5"
              >
                投资论点
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href={toolsRoute}
                className="site-rule inline-flex items-center gap-2 rounded-full border bg-[var(--paper)] px-6 py-3 text-sm font-medium transition-transform hover:-translate-y-0.5 hover:border-[var(--forest)]"
              >
                小工具
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href={knowledgeRoute}
                className="site-rule inline-flex items-center gap-2 rounded-full border bg-[var(--paper)] px-6 py-3 text-sm font-medium transition-transform hover:-translate-y-0.5 hover:border-[var(--forest)]"
              >
                资料库
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>

          <aside className="site-rule border-l pl-7 lg:mb-2">
            <p className="site-serif text-2xl leading-relaxed">
              “价格是你付出的，价值是你得到的。”
            </p>
            <p className="site-muted mt-4 text-sm">
              把注意力放回真正重要的事物。
            </p>
            <div className="site-rule mt-8 border-t pt-5">
              <span className="site-muted text-xs uppercase tracking-[0.2em]">
                当前整理
              </span>
              <p className="mt-2 text-sm">大师资料 · 企业研究 · 长期思考</p>
            </div>
          </aside>
        </div>
      </section>

      <section className="site-rule relative border-y">
        <div className="mx-auto grid max-w-6xl gap-px bg-[var(--line)] md:grid-cols-3">
          {[
            {
              index: "01",
              title: "理解企业",
              copy: "从商业模式、竞争优势与现金流出发，形成对企业的独立判断。",
            },
            {
              index: "02",
              title: "敬畏市场",
              copy: "把波动视为背景，把风险控制与安全边际放在决策之前。",
            },
            {
              index: "03",
              title: "长期复利",
              copy: "让知识、判断与耐心共同积累，接受缓慢而真实的成长。",
            },
          ].map((item) => (
            <article
              key={item.index}
              className="bg-[var(--paper)] px-6 py-9 md:px-8 md:py-11"
            >
              <span className="site-muted font-mono text-[10px] tracking-[0.18em]">
                {item.index}
              </span>
              <h2 className="site-serif mt-5 text-2xl font-medium">
                {item.title}
              </h2>
              <p className="site-muted mt-3 max-w-xs text-sm leading-7">
                {item.copy}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
