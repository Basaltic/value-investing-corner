import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import {
  appEnglishName,
  appName,
  blogRoute,
  gitConfig,
  knowledgeRoute,
} from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-[var(--forest)] text-[11px] font-semibold text-[var(--paper)]">
            值
          </span>
          <span className="flex flex-col">
            <span className="site-serif text-[1.05rem] font-semibold leading-none tracking-wide">
              {appName}
            </span>
            <span className="mt-1 text-[7px] font-medium uppercase tracking-[0.16em] opacity-55">
              {appEnglishName}
            </span>
          </span>
        </span>
      ),
    },
    links: [
      {
        text: "基本理念",
        url: knowledgeRoute,
        active: "nested-url",
      },
      {
        text: "思考札记",
        url: blogRoute,
        active: "nested-url",
      },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
