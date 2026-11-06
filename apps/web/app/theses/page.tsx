import type { Metadata } from "next";
import { ThesisBoard } from "@/components/thesis/board";
import "./theses.css";

export const metadata: Metadata = {
  title: "投资论点",
  description:
    "记录商业模式、竞争优势、估值依据、主要风险与证伪条件，仅保存在当前浏览器。",
};

export default function ThesesPage() {
  return (
    <main className="thesis-page site-paper mx-auto w-full max-w-[1600px] flex-1 px-5 py-8 md:px-10 lg:px-16">
      <ThesisBoard />
    </main>
  );
}
