import { ArrowUpRight, Calculator } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { dcfRoute } from "@/lib/shared";

export const metadata: Metadata = {
  title: "小工具",
  description: "一些方便使用的价值投资小工具，从现金流折现估值开始。",
};

export default function ToolsPage() {
  return (
    <main className="site-paper mx-auto w-full max-w-6xl flex-1 px-6 py-16 md:px-10 md:py-24">
      <p className="site-forest text-xs font-medium uppercase tracking-[0.2em]">
        Tools for independent thinking
      </p>
      <h1 className="site-serif mt-4 text-4xl font-medium md:text-5xl">
        小工具
      </h1>
      <p className="site-muted mt-6 max-w-2xl text-base leading-8">
        把重复的计算交给工具，把重要的判断留给自己。
      </p>
      <Link
        href={dcfRoute}
        className="group site-rule mt-12 flex max-w-3xl flex-col gap-8 rounded-2xl border bg-[var(--paper-deep)] p-7 transition-colors hover:border-[var(--forest)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--forest)] sm:flex-row sm:items-start md:p-9"
      >
        <span className="site-forest grid size-12 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--paper)]">
          <Calculator className="size-5" />
        </span>
        <div className="flex-1">
          <p className="site-muted text-xs tracking-[0.16em]">
            DCF / 企业自由现金流
          </p>
          <h2 className="site-serif mt-3 text-2xl font-medium md:text-3xl">
            现金流折现估值
          </h2>
          <p className="site-muted mt-4 text-sm leading-7">
            输入基础现金流、增长和折现假设，快速计算企业价值、股权价值与每股估值。每一步计算都可以回看。
          </p>
          <span className="site-forest mt-6 inline-flex items-center gap-2 text-sm font-medium">
            打开工具
            <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
      <p className="site-muted mt-8 text-sm">
        工具只辅助计算，不替代对企业的研究，也不构成投资建议。
      </p>
    </main>
  );
}
