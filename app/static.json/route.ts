import { toDocuments } from "fumadocs-core/search/algolia";
import { knowledgeSource } from "@/lib/source";

// Explicitly prerender the export: the sync script reads the build artifact.
export const dynamic = "force-static";
export const revalidate = false;

export async function GET() {
  return Response.json(await toDocuments(knowledgeSource));
}
