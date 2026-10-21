import { HomeLayout } from "fumadocs-ui/layouts/home";
import { baseOptions } from "@/lib/layout.shared";
import { blogRoute, knowledgeRoute } from "@/lib/shared";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <HomeLayout
      {...baseOptions()}
      links={[
        { text: "知识库", url: knowledgeRoute, active: "nested-url" },
        { text: "思想札记", url: blogRoute, active: "nested-url" },
      ]}
    >
      {children}
    </HomeLayout>
  );
}
