import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AnnualReturnCalculator } from "@/components/annual-return-calculator";
import { toolsRoute } from "@/lib/shared";

export const metadata: Metadata = {
  title: "预期年化收益",
  description:
    "根据买入价、每股收益增长、退出市盈率与分红支付率，计算年末现金分红口径的预期年化收益率（IRR）。",
};

export default function AnnualReturnPage() {
  return (
    <main className="site-paper mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:px-10 md:py-16">
      <Link
        href={toolsRoute}
        className="site-muted inline-flex items-center gap-2 text-sm hover:text-[var(--forest)]"
      >
        <ArrowLeft className="size-4" />
        全部小工具
      </Link>
      <div className="mb-10 mt-8">
        <p className="site-forest text-xs font-medium tracking-[0.16em]">
          EXPECTED RETURN / 盈利 · 估值 · 分红
        </p>
        <h1 className="site-serif mt-3 text-3xl font-medium md:text-5xl">
          预期年化收益
        </h1>
        <p className="site-muted mt-5 max-w-3xl text-sm leading-7 md:text-base">
          好公司，也需要合适的买入价格。用盈利、退出估值和分红假设，看看这笔投资可能带来怎样的回报。
        </p>
      </div>
      <AnnualReturnCalculator />
    </main>
  );
}
