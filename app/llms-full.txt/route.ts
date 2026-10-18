import { blogLlms, knowledgeLlms } from "@/lib/source";

export const revalidate = false;

export async function GET() {
  const [knowledge, notes] = await Promise.all([
    knowledgeLlms.full(),
    blogLlms.full(),
  ]);

  return new Response(`${knowledge}\n\n${notes}`);
}
