import {
  blogMetadataSchema,
  knowledgeMetadataSchema,
} from "@value-investing/content-schema";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";
import { defineDocs } from "fumadocs-mdx/macro";

const knowledgeSchema = pageSchema.extend(knowledgeMetadataSchema.shape);
const blogSchema = pageSchema.extend(blogMetadataSchema.shape);

// Shared by Next.js and the standalone Node index exporter.
export const knowledgeCollection = defineDocs({
  dir: "../../content/knowledge",
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
  dir: "../../content/blog",
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
