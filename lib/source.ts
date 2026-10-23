import { llms, loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { blogCollection, knowledgeCollection } from "./content-collections.mjs";
import { blogRoute, knowledgeRoute } from "./shared";

export const knowledgeSource = loader({
  baseUrl: knowledgeRoute,
  source: knowledgeCollection.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const blogSource = loader({
  baseUrl: blogRoute,
  source: blogCollection.toFumadocsSource(),
  plugins: [lucideIconsPlugin()],
});

export const knowledgeLlms = llms(knowledgeSource, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText("processed")}`,
});

export const blogLlms = llms(blogSource, {
  renderPage: async (page) => `# ${page.data.title} (${page.url})

${await page.data.getText("processed")}`,
});

export async function getSearchIndexes() {
  const pages = knowledgeSource.getPages();

  return Promise.all(
    pages.map(async (page) => ({
      title: page.data.title,
      description: page.data.description,
      content: await page.data.getText("processed"),
      url: page.url,
      keywords: page.data.tags.join(" "),
    })),
  );
}
