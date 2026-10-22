"use client";

import { liteClient } from "algoliasearch/lite";
import AlgoliaSearchDialog from "fumadocs-ui/components/dialog/search-algolia";
import type { SharedProps } from "fumadocs-ui/contexts/search";
import { RootProvider } from "fumadocs-ui/provider/next";
import Image from "next/image";
import { type ReactNode, useCallback, useMemo } from "react";

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
        <AlgoliaSearchDialog
          {...props}
          searchOptions={{ client, indexName }}
          showAlgolia
          footer={
            <Image
              src="/algolia.svg"
              alt="Algolia"
              width={20}
              height={20}
              unoptimized
            />
          }
        />
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
