import { invoke, isTauri } from "@tauri-apps/api/core";
import type { JSONContent } from "@tiptap/react";
export type JudgmentInput = { document: JSONContent; reason: string };
export type Judgment = JudgmentInput & {
  id: string;
  company_id: string;
  text: string;
  revision: number;
  version: number | null;
  base_id: string | null;
  created_at: string;
  updated_at: string;
};
export type JudgmentState = { draft: Judgment | null; versions: Judgment[] };
type Invoker = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
export function createJudgmentApi(native = isTauri(), call: Invoker = invoke) {
  async function request<T>(
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!native)
      throw new Error("判断读写仅在Tauri桌面窗口可用，浏览器不能保存。");
    return call<T>(cmd, args);
  }
  return {
    state: (companyId: string) =>
      request<JudgmentState>("judgment_state", { companyId }),
    start: (companyId: string, baseId: string | null) =>
      request<Judgment>("judgment_start", { companyId, baseId }),
    save: (id: string, expectedRevision: number, input: JudgmentInput) =>
      request<Judgment>("judgment_save", { id, expectedRevision, input }),
    freeze: (id: string, expectedRevision: number) =>
      request<Judgment>("judgment_freeze", { id, expectedRevision }),
    discard: (id: string, expectedRevision: number) =>
      request<void>("judgment_discard", { id, expectedRevision }),
    closeWindow: () => request<void>("judgment_close_window", {}),
  };
}
