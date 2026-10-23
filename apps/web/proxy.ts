import { isMarkdownPreferred, rewritePath } from "fumadocs-core/negotiation";
import { type NextRequest, NextResponse } from "next/server";
import {
  blogContentRoute,
  blogRoute,
  knowledgeContentRoute,
  knowledgeRoute,
} from "@/lib/shared";

const { rewrite: rewriteKnowledge } = rewritePath(
  `${knowledgeRoute}{/*path}`,
  `${knowledgeContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteBlog } = rewritePath(
  `${blogRoute}{/*path}`,
  `${blogContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteKnowledgeSuffix } = rewritePath(
  `${knowledgeRoute}{/*path}.md`,
  `${knowledgeContentRoute}{/*path}/content.md`,
);
const { rewrite: rewriteBlogSuffix } = rewritePath(
  `${blogRoute}{/*path}.md`,
  `${blogContentRoute}{/*path}/content.md`,
);

export default function proxy(request: NextRequest) {
  const suffixResult =
    rewriteKnowledgeSuffix(request.nextUrl.pathname) ??
    rewriteBlogSuffix(request.nextUrl.pathname);

  if (suffixResult) {
    return NextResponse.rewrite(new URL(suffixResult, request.nextUrl));
  }

  const result =
    rewriteKnowledge(request.nextUrl.pathname) ??
    rewriteBlog(request.nextUrl.pathname);

  if (result && isMarkdownPreferred(request)) {
    return NextResponse.rewrite(new URL(result, request.nextUrl), {
      headers: { Vary: "Accept" },
    });
  }

  return NextResponse.next();
}
