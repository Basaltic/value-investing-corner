"use client";

import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { siteSections as sections } from "@/lib/shared";

export function SectionSelect() {
  const pathname = usePathname();
  const router = useRouter();
  const currentSection = sections.find(
    ({ url }) => pathname === url || pathname.startsWith(`${url}/`),
  );

  return (
    <div className="relative w-full sm:w-auto">
      <select
        aria-label="切换栏目"
        value={currentSection?.url ?? ""}
        onChange={(event) => {
          const section = sections.find(
            ({ url }) => url === event.target.value,
          );
          if (section) router.push(section.url);
        }}
        className="w-full cursor-pointer appearance-none rounded-lg border border-fd-border bg-fd-secondary/50 py-2 ps-3 pe-9 text-sm font-medium text-fd-foreground transition-colors hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring sm:min-w-32"
      >
        <option value="" disabled>
          选择栏目
        </option>
        {sections.map(({ label, url }) => (
          <option key={url} value={url}>
            {label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-fd-muted-foreground"
      />
    </div>
  );
}
