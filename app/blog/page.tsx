import { ArrowLeft, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { blogSource } from "@/lib/source";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export const metadata = {
  title: "思考札记",
  description: "记录关于投资、商业与长期成长的理性思考。",
};

export default function BlogPage() {
  const pages = blogSource
    .getPages()
    .sort(
      (left, right) =>
        new Date(right.data.date).getTime() -
        new Date(left.data.date).getTime(),
    );

  return (
    <main className="site-paper flex-1">
      <div className="mx-auto max-w-5xl px-6 py-14 md:px-10 md:py-20">
        <Link
          href="/"
          className="site-muted inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--ink)]"
        >
          <ArrowLeft className="size-4" />
          返回首页
        </Link>

        <header className="site-rule mt-12 border-b pb-12">
          <p className="site-forest text-[11px] font-semibold uppercase tracking-[0.24em]">
            Notes on rational thinking
          </p>
          <div className="mt-5 grid gap-7 md:grid-cols-[1fr_20rem] md:items-end">
            <h1 className="site-serif text-5xl font-medium tracking-[-0.04em] md:text-7xl">
              思考札记
            </h1>
            <p className="site-muted text-sm leading-7">
              写下来，才能看见判断中的缝隙。这里记录观点形成的过程，也保留那些需要继续追问的问题。
            </p>
          </div>
        </header>

        <section className="divide-y divide-[var(--line)]">
          {pages.map((page, index) => (
            <article key={page.url} className="group py-9 md:py-11">
              <Link
                href={page.url}
                className="grid gap-6 md:grid-cols-[7rem_1fr_2rem] md:items-start"
              >
                <div className="site-muted flex items-center gap-3 font-mono text-[11px] tracking-[0.1em] md:block">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <time className="md:mt-2 md:block" dateTime={page.data.date}>
                    {formatDate(page.data.date)}
                  </time>
                </div>
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {page.data.tags.map((tag) => (
                      <span
                        key={tag}
                        className="site-forest rounded-full bg-[var(--forest-soft)] px-2.5 py-1 text-[11px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="site-serif text-2xl font-medium tracking-[-0.02em] md:text-3xl">
                    {page.data.title}
                  </h2>
                  <p className="site-muted mt-3 max-w-2xl text-sm leading-7 md:text-base">
                    {page.data.description}
                  </p>
                </div>
                <ArrowUpRight className="mt-1 size-5 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" />
              </Link>
            </article>
          ))}
        </section>

        {pages.length === 0 ? (
          <div className="site-rule mt-10 rounded-2xl border border-dashed p-10 text-center">
            <p className="site-serif text-xl">还没有文章。</p>
            <p className="site-muted mt-2 text-sm">
              在 <code>content/blog</code> 中新增 Markdown 文件即可开始。
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
