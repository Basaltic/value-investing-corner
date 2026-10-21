import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { siteSections } from "@/lib/shared";

export default function Layout({ children }: LayoutProps<"/tools">) {
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
    </HomeLayout>
  );
}
