import { invoke, isTauri } from "@tauri-apps/api/core";
export type SourceInput = {
  enabled: boolean;
  level: "blocked" | "metadata" | "full";
  evidence_url: string;
  evidence: string;
  purpose: string;
  purpose_confirmed: boolean;
  daily_limit: number;
  min_interval_secs: number;
};
export type Source = { id: string; revision: number; input: SourceInput };
export type CollectionRun = {
  id: string;
  company_id: string;
  source_id: string;
  request_key: string;
  state: "queued" | "running" | "succeeded" | "failed" | "skipped";
  attempts: number;
  reason: string;
  created_at: string;
  updated_at: string;
};
export type CollectionEvent = {
  sequence: number;
  created_at: string;
  run_id: string;
  state: string;
  attempt: number;
  reason: string;
};
export type CredentialStatus = { configured: boolean };
type Invoker = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
export function createCollectionApi(
  native = isTauri(),
  call: Invoker = invoke,
) {
  async function req<T>(
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!native)
      throw new Error("来源与任务仅原生桌面可管理，浏览器不能操作凭据");
    return call<T>(cmd, args);
  }
  return {
    sources: () => req<Source[]>("collection_sources", {}),
    saveSource: (id: string, input: SourceInput, expectedRevision: number) =>
      req<Source>("collection_save_source", { id, input, expectedRevision }),
    enqueue: (companyId: string, sourceId: string, requestKey: string) =>
      req<CollectionRun>("collection_enqueue", {
        companyId,
        sourceId,
        requestKey,
      }),
    runs: () => req<CollectionRun[]>("collection_runs", {}),
    events: (id: string) => req<CollectionEvent[]>("collection_events", { id }),
    execute: (id: string) => req<CollectionRun>("collection_execute", { id }),
    retry: (id: string) => req<CollectionRun>("collection_retry", { id }),
    secretStatus: (sourceId: string) =>
      req<CredentialStatus>("collection_credential_status", { sourceId }),
    secretSave: (sourceId: string, secret: string) =>
      req<CredentialStatus>("collection_credential_save", { sourceId, secret }),
    secretRemove: (sourceId: string) =>
      req<CredentialStatus>("collection_credential_remove", { sourceId }),
  };
}
