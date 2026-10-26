import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { AlgoliaAttribution } from "@/components/algolia-attribution";
import { baseOptions } from "@/lib/layout.shared";
import { knowledgeSource } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/knowledge">) {
  return (
    <DocsLayout
      tree={knowledgeSource.getPageTree()}
      {...baseOptions()}
      sidebar={{
        footer: (
          <div
            key="algolia-attribution"
            className="mt-3 flex justify-center border-t border-fd-border pt-3"
          >
            <AlgoliaAttribution />
          </div>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
