import { z } from "zod";

// Framework-independent metadata only. Each app owns URLs, rendering and storage.
export const knowledgeMetadataSchema = z.object({
  category: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const blogMetadataSchema = z.object({
  date: z.string(),
  updated: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type KnowledgeMetadata = z.infer<typeof knowledgeMetadataSchema>;
export type BlogMetadata = z.infer<typeof blogMetadataSchema>;
