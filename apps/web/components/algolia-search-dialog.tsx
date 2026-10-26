"use client";

import {
  type AlgoliaOptions,
  useAlgoliaSearch,
} from "fumadocs-core/search/client";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
} from "fumadocs-ui/components/dialog/search";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import type { SharedProps } from "fumadocs-ui/contexts/search";
import { AlgoliaAttribution } from "./algolia-attribution";

// Keep the footer inside the portal-backed popup. The library's Algolia dialog
// currently renders its footer as a sibling, leaking it into the page layout.
export default function AlgoliaSearchDialog({
  searchOptions,
  ...props
}: SharedProps & { searchOptions: AlgoliaOptions }) {
  const { locale } = useI18n();
  const search = useAlgoliaSearch({ locale, ...searchOptions });

  return (
    <SearchDialog {...search} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList />
        <SearchDialogFooter className="flex justify-end">
          <AlgoliaAttribution />
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}
