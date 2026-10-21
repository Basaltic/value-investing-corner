import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { blogRoute } from "@/lib/shared";
import { blogSource } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/blog">) {
  const tree = blogSource.getPageTree();

  return (
    <DocsLayout
      tree={{
        ...tree,
        name: "思想札记",
        children: [
          { type: "page", name: "札记目录", url: blogRoute },
          ...tree.children,
        ],
      }}
      {...baseOptions()}
    >
      {children}
    </DocsLayout>
  );
}
