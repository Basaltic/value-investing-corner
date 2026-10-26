"use client";

import { liteClient } from "algoliasearch/lite";
import type { SharedProps } from "fumadocs-ui/contexts/search";
import { RootProvider } from "fumadocs-ui/provider/next";
import { type ReactNode, useCallback, useMemo } from "react";
import AlgoliaSearchDialog from "./algolia-search-dialog";

export function Providers({
  children,
  indexName,
}: {
  children: ReactNode;
  indexName: string;
}) {
  // Use static property access so Next.js can inline the mapped public values.
  const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
  const searchKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY;
  const client = useMemo(
    () => (appId && searchKey ? liteClient(appId, searchKey) : undefined),
    [appId, searchKey],
  );
  const SearchDialog = useCallback(
    (props: SharedProps) => {
      if (!client) return null;

      return (
        <AlgoliaSearchDialog {...props} searchOptions={{ client, indexName }} />
      );
    },
    [client, indexName],
  );

  return (
    <RootProvider search={client ? { SearchDialog } : undefined}>
      {children}
    </RootProvider>
  );
}
