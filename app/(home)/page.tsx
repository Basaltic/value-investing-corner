import {
  ArrowUpRight,
  BookOpen,
  Calculator,
  Compass,
  PenLine,
} from "lucide-react";
import Link from "next/link";
import { toolsRoute } from "@/lib/shared";
import { blogSource } from "@/lib/source";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export default function HomePage() {
  const latestNote = blogSource
    .getPages()
    .sort(
      (left, right) =>
        new Date(right.data.date).getTime() -
        new Date(left.data.date).getTime(),
    )[0];

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
                href="/knowledge"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-sm font-medium text-[var(--paper)] transition-transform hover:-translate-y-0.5"
              >
                浏览知识库
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href="/blog"
                className="site-rule inline-flex items-center gap-2 rounded-full border bg-transparent px-6 py-3 text-sm font-medium transition-colors hover:bg-[var(--forest-soft)]"
              >
                阅读思想札记
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

      <section className="relative mx-auto w-full max-w-6xl px-6 py-20 md:px-10 md:py-28">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="site-muted text-[11px] uppercase tracking-[0.22em]">
              Explore the archive
            </p>
            <h2 className="site-serif mt-3 text-3xl font-medium md:text-4xl">
              三种方式，一个长期目标
            </h2>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Link
            href="/knowledge"
            className="group site-rule flex min-h-64 flex-col justify-between rounded-3xl border bg-[var(--paper-deep)] p-7 transition-colors hover:border-[var(--forest)] md:p-9"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)]">
                <BookOpen className="site-forest size-5" />
              </span>
              <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <div>
              <span className="site-muted text-xs tracking-[0.16em]">
                01 / KNOWLEDGE
              </span>
              <h3 className="site-serif mt-3 text-3xl font-medium">知识库</h3>
              <p className="site-muted mt-3 max-w-md text-sm leading-7">
                从投资人物、核心思想与原始资料出发，沿着清晰的学习路径进入价值投资。
              </p>
            </div>
          </Link>

          <Link
            href="/blog"
            className="group site-rule flex min-h-64 flex-col justify-between rounded-3xl border bg-[var(--forest-soft)] p-7 transition-colors hover:border-[var(--forest)] md:p-9"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)]">
                <PenLine className="site-forest size-5" />
              </span>
              <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <div>
              <span className="site-muted text-xs tracking-[0.16em]">
                02 / NOTES
              </span>
              <h3 className="site-serif mt-3 text-3xl font-medium">思想札记</h3>
              <p className="site-muted mt-3 max-w-md text-sm leading-7">
                用写作校准判断，留下观点形成的过程，而不只保存最后结论。
              </p>
            </div>
          </Link>

          <Link
            href={toolsRoute}
            className="group site-rule flex min-h-64 flex-col justify-between rounded-3xl border bg-[var(--paper-deep)] p-7 transition-colors hover:border-[var(--forest)] md:p-9"
          >
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)]">
                <Calculator className="site-forest size-5" />
              </span>
              <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
            <div>
              <span className="site-muted text-xs tracking-[0.16em]">
                03 / TOOLS
              </span>
              <h3 className="site-serif mt-3 text-3xl font-medium">小工具</h3>
              <p className="site-muted mt-3 max-w-md text-sm leading-7">
                用方便的小工具辅助独立判断，从现金流折现估值开始，让计算有据可查。
              </p>
            </div>
          </Link>
        </div>

        {latestNote ? (
          <Link
            href={latestNote.url}
            className="site-rule mt-5 flex flex-col gap-5 rounded-3xl border px-7 py-6 transition-colors hover:bg-[var(--forest-soft)] md:flex-row md:items-center md:justify-between md:px-9"
          >
            <div className="flex items-start gap-4">
              <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--paper)]">
                <Compass className="size-4" />
              </span>
              <div>
                <p className="site-muted text-xs tracking-[0.14em]">最近更新</p>
                <h3 className="site-serif mt-1 text-xl font-medium">
                  {latestNote.data.title}
                </h3>
              </div>
            </div>
            <time
              className="site-muted text-sm"
              dateTime={latestNote.data.date}
            >
              {formatDate(latestNote.data.date)}
            </time>
          </Link>
        ) : null}
      </section>
    </main>
  );
}
