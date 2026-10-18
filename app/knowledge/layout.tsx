import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { knowledgeSource } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/knowledge">) {
  return (
    <DocsLayout tree={knowledgeSource.getPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
