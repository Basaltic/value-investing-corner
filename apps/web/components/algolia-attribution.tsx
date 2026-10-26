"use client";

import Image from "next/image";

export function AlgoliaAttribution() {
  if (
    !process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ||
    !process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY
  ) {
    return null;
  }

  return (
    <a
      href="https://algolia.com"
      target="_blank"
      rel="noopener noreferrer"
      data-algolia-attribution
      className="inline-flex max-w-full items-center gap-2 text-[11px] leading-5 text-fd-muted-foreground transition-colors hover:text-fd-foreground"
    >
      <Image
        src="/algolia.svg"
        alt=""
        width={16}
        height={16}
        unoptimized
        className="shrink-0 dark:invert"
      />
      <span>Search powered by Algolia</span>
    </a>
  );
}
