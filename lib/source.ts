import { llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";
import { blogRoute, knowledgeRoute } from "./shared";

const knowledgeSchema = pageSchema.extend({
  category: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const blogSchema = pageSchema.extend({
  date: z.string(),
  updated: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

const knowledgeCollection = defineDocs({
  dir: "content/knowledge",
  docs: {
    schema: knowledgeSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

const blogCollection = defineDocs({
  dir: "content/blog",
  docs: {
    schema: blogSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export const knowledgeSource = loader({
  baseUrl: knowledgeRoute,
  source: knowledgeCollection.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const blogSource = loader({
  baseUrl: blogRoute,
  source: blogCollection.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const knowledgeLlms = llms(knowledgeSource, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText("processed")}`,
});

export const blogLlms = llms(blogSource, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText("processed")}`,
});

export async function getSearchIndexes() {
  const pages = [...knowledgeSource.getPages(), ...blogSource.getPages()];

  return Promise.all(
    pages.map(async (page) => ({
      title: page.data.title,
      description: page.data.description,
      content: await page.data.getText("processed"),
      url: page.url,
      keywords: page.data.tags.join(" "),
    })),
  );
}
