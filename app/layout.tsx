import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import "./global.css";
import { Providers } from "@/components/providers";
import { appDescription, appName } from "@/lib/shared";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: appDescription,
};

export default function Layout({ children }: LayoutProps<"/">) {
  const indexName = process.env.ALGOLIA_INDEX_NAME ?? "document";

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Providers indexName={indexName}>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
