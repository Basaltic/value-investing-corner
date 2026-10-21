import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DcfCalculator } from "@/components/dcf-calculator";
import { toolsRoute } from "@/lib/shared";

export const metadata: Metadata = {
  title: "DCF 现金流折现估值",
  description: "基于 FCFF、年末折现和永续增长模型的现金流折现估值工具。",
};

export default function DcfPage() {
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
          DCF / 企业自由现金流（FCFF）
        </p>
        <h1 className="site-serif mt-3 text-3xl font-medium md:text-5xl">
          现金流折现估值
        </h1>
        <p className="site-muted mt-5 max-w-3xl text-sm leading-7 md:text-base">
          用未来的现金流，估算今天的价值。填写假设后即时计算，不需要上传财报。
        </p>
      </div>
      <DcfCalculator />
    </main>
  );
}
