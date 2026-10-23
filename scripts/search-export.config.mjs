import { defineConfig } from "fumadocs-mdx/config";

// The standalone exporter runs in Node, not a bundler. Keep image paths as URLs
// instead of generating PNG/JPEG imports. Search structure still uses the full
// Fumadocs preset; the site's own rendering configuration is unchanged.
export default defineConfig({
  mdxOptions: {
    remarkImageOptions: { useImport: false },
  },
});
