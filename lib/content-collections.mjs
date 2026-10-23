import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";
import { z } from "zod";

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

// Shared by Next.js and the standalone Node index exporter.
export const knowledgeCollection = defineDocs({
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

export const blogCollection = defineDocs({
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
