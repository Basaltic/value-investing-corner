import { HomeLayout } from "fumadocs-ui/layouts/home";
import { AlgoliaAttribution } from "@/components/algolia-attribution";
import { baseOptions } from "@/lib/layout.shared";
import { siteSections } from "@/lib/shared";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <HomeLayout
      {...baseOptions()}
      links={siteSections.map(({ label, url }) => ({
        text: label,
        url,
        active: "nested-url",
      }))}
    >
      {children}
      <footer className="site-rule mt-auto flex justify-center border-t px-6 py-5">
        <AlgoliaAttribution />
      </footer>
    </HomeLayout>
  );
}
