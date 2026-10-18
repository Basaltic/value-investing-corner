import { notFound } from "next/navigation";
import { getBlogMarkdownUrl } from "@/lib/shared";
import { blogLlms, blogSource } from "@/lib/source";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/blog/[...slug]">,
) {
  const { slug } = await params;
  const page = blogSource.getPage(slug?.slice(0, -1));
  if (!page) notFound();

  return new Response(await blogLlms.page(page), {
    headers: {
      "Content-Type": "text/markdown",
    },
  });
}

export function generateStaticParams() {
  return blogSource.getPages().map((page) => ({
    lang: page.locale,
    slug: getBlogMarkdownUrl(page).segments,
  }));
}
