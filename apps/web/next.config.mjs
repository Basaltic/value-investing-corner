import { fileURLToPath } from "node:url";
import { createMDX } from "fumadocs-mdx/next";

const withMDX = createMDX();

const appId =
  process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? process.env.ALGOLIA_APP_ID ?? "";
const searchKey =
  process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY ??
  process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY ??
  process.env.ALGOLIA_SEARCH_API_KEY ??
  "";
const writeKey =
  process.env.ALGOLIA_WRITE_KEY ?? process.env.ALGOLIA_WRITE_API_KEY;

// Reject a misconfigured search key before it can be inlined into browser JS.
if (searchKey && writeKey && searchKey === writeKey) {
  throw new Error("Algolia 搜索密钥不能与写入密钥相同。");
}

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL("../../", import.meta.url)),
  transpilePackages: [
    "@value-investing/valuation",
    "@value-investing/content-schema",
  ],
  // Only these two browser-safe credentials are exposed. Never map write keys.
  env: {
    NEXT_PUBLIC_ALGOLIA_APP_ID: appId,
    NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: searchKey,
  },
};

export default withMDX(config);
