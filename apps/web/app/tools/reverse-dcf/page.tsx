import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ReverseDcfCalculator } from "@/components/reverse-dcf-calculator";
import { dcfRoute, toolsRoute } from "@/lib/shared";

export const metadata: Metadata = {
  title: "反向 DCF",
  description:
    "固定 FCFF、预测年数、WACC 和永续增长率，从当前股价反推预测期现金流年增长率。",
};

export default function ReverseDcfPage() {
  return (
    <main className="site-paper mx-auto w-full max-w-6xl flex-1 px-6 py-12 md:px-10 md:py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href={toolsRoute}
          className="site-muted inline-flex items-center gap-2 text-sm hover:text-[var(--forest)]"
        >
          <ArrowLeft className="size-4" />
          全部小工具
        </Link>
        <Link
          href={dcfRoute}
          className="site-muted inline-flex items-center gap-2 text-sm hover:text-[var(--forest)]"
        >
          正向 DCF
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mb-10 mt-8">
        <p className="site-forest text-xs font-medium tracking-[0.16em]">
          REVERSE DCF / 企业自由现金流（FCFF）
        </p>
        <h1 className="site-serif mt-3 text-3xl font-medium md:text-5xl">
          反向 DCF
        </h1>
        <p className="site-muted mt-5 max-w-3xl text-sm leading-7 md:text-base">
          不先猜增长，再算价格。固定其他假设，看看当前股价对应怎样的现金流增长。
        </p>
      </div>
      <ReverseDcfCalculator />
    </main>
  );
}
