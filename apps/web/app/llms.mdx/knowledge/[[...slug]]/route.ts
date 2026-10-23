import { notFound } from "next/navigation";
import { getPageMarkdownUrl } from "@/lib/shared";
import { knowledgeLlms, knowledgeSource } from "@/lib/source";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/llms.mdx/knowledge/[[...slug]]">,
) {
  const { slug } = await params;
  const page = knowledgeSource.getPage(slug?.slice(0, -1));
  if (!page) notFound();

  return new Response(await knowledgeLlms.page(page), {
    headers: {
      "Content-Type": "text/markdown",
    },
  });
}

export function generateStaticParams() {
  return knowledgeSource.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageMarkdownUrl(page).segments,
  }));
}
