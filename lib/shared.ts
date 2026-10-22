import { createGetUrl } from "fumadocs-core/source";

export const appName = "价投小角落";
export const appEnglishName = "Value Investing Corner";
export const appDescription =
  "价投小角落（Value Investing Corner）专注价值投资、记录理性思考与长期成长。";

export const knowledgeRoute = "/knowledge";
export const knowledgeImageRoute = "/og/knowledge";
export const knowledgeContentRoute = "/llms.mdx/knowledge";
export const blogRoute = "/blog";
export const blogContentRoute = "/llms.mdx/blog";
export const toolsRoute = "/tools";
export const dcfRoute = `${toolsRoute}/dcf`;

export const siteSections = [
  { label: "知识库", url: knowledgeRoute },
  { label: "小工具", url: toolsRoute },
];

const getKnowledgeContentUrl = createGetUrl(knowledgeContentRoute);
const getKnowledgeImageUrl = createGetUrl(knowledgeImageRoute);
const getBlogContentUrl = createGetUrl(blogContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getKnowledgeContentUrl(segments, page.locale) };
}

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "image.png"];

  return { segments, url: getKnowledgeImageUrl(segments, page.locale) };
}

export function getBlogMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getBlogContentUrl(segments, page.locale) };
}
