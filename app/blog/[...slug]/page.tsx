import { DocsBody, MarkdownCopyButton } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { getBlogMarkdownUrl } from "@/lib/shared";
import { blogSource } from "@/lib/source";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+08:00`));
}

export default async function BlogPost(props: PageProps<"/blog/[...slug]">) {
  const params = await props.params;
  const page = blogSource.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getBlogMarkdownUrl(page).url;

  return (
    <main className="site-paper flex-1">
      <article className="mx-auto max-w-4xl px-6 py-14 md:px-10 md:py-20">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/blog"
            className="site-muted inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft className="size-4" />
            全部札记
          </Link>
          <MarkdownCopyButton markdownUrl={markdownUrl} />
        </div>

        <header className="site-rule mt-10 border-b pb-10">
          <div className="flex flex-wrap gap-2">
            {page.data.tags.map((tag) => (
              <span
                key={tag}
                className="site-forest rounded-full bg-[var(--forest-soft)] px-3 py-1 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="site-serif mt-6 text-4xl font-medium leading-tight tracking-[-0.035em] md:text-6xl">
            {page.data.title}
          </h1>
          <p className="site-muted mt-5 max-w-2xl text-base leading-8 md:text-lg">
            {page.data.description}
          </p>
          <div className="site-muted mt-7 flex flex-wrap items-center gap-4 text-xs tracking-[0.08em]">
            <time dateTime={page.data.date}>{formatDate(page.data.date)}</time>
            {page.data.updated ? (
              <>
                <span className="size-1 rounded-full bg-[var(--ink-muted)]" />
                <span>更新于 {formatDate(page.data.updated)}</span>
              </>
            ) : null}
          </div>
        </header>

        <DocsBody className="mt-10">
          <MDX
            components={getMDXComponents({
              a: createRelativeLink(blogSource, page),
            })}
          />
        </DocsBody>
      </article>
    </main>
  );
}

export function generateStaticParams() {
  return blogSource.generateParams();
}

export async function generateMetadata(
  props: PageProps<"/blog/[...slug]">,
): Promise<Metadata> {
  const params = await props.params;
  const page = blogSource.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
