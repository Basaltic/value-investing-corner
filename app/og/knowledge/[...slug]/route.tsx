import { generateOGImage } from "fumadocs-ui/og";
import { notFound } from "next/navigation";
import { appName, getPageImageUrl } from "@/lib/shared";
import { knowledgeSource } from "@/lib/source";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/og/knowledge/[...slug]">,
) {
  const { slug } = await params;
  const page = knowledgeSource.getPage(slug.slice(0, -1));
  if (!page) notFound();

  return generateOGImage({
    title: page.data.title,
    description: page.data.description,
    site: appName,
  });
}

export function generateStaticParams() {
  return knowledgeSource.getPages().map((page) => ({
    lang: page.locale,
    slug: getPageImageUrl(page).segments,
  }));
}
