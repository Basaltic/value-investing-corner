import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import Link from "next/link";
import { blogSource } from "@/lib/source";

export const metadata = {
  title: "思想札记",
  description: "记录关于投资、商业与长期成长的理性思考。",
};

export default function NotesPage() {
  const pages = blogSource.getPages();

  return (
    <DocsPage
      tableOfContent={{ enabled: false }}
      tableOfContentPopover={{ enabled: false }}
    >
      <DocsTitle>思想札记</DocsTitle>
      <DocsDescription>
        写下来，才能看见判断中的缝隙。这里记录观点形成的过程，也保留那些需要继续追问的问题。
      </DocsDescription>
      <DocsBody>
        <h2>札记目录</h2>
        {pages.length > 0 ? (
          <ul>
            {pages.map((page) => (
              <li key={page.url}>
                <Link href={page.url}>{page.data.title}</Link>
                <p className="text-sm text-fd-muted-foreground">
                  {page.data.description}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>还没有札记。</p>
        )}
      </DocsBody>
    </DocsPage>
  );
}
