import { createSearchAPI } from "fumadocs-core/search/server";
import { getSearchIndexes } from "@/lib/source";

export const { GET } = createSearchAPI("simple", {
  indexes: getSearchIndexes,
});
