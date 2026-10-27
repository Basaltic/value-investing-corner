import { invoke, isTauri } from "@tauri-apps/api/core";
export type DashboardGroup = {
  id: string;
  name: string;
  company_ids: string[];
};
export type MetricSelection = {
  kind: "fact" | "derived" | "custom";
  metric: string;
  anchor_id: string;
};
export type DashboardCard = {
  id: string;
  company_id: string;
  kind: "metric" | "reading" | "supplement" | "judgment";
  visible: boolean;
  selection: MetricSelection | null;
  from: string;
  to: string;
  show_pending: boolean;
};
export type DashboardConfig = {
  groups: DashboardGroup[];
  cards: DashboardCard[];
};
export type DashboardSaved = { revision: number; config: DashboardConfig };
export type ResearchItem = {
  id: string;
  company_id: string;
  kind: "reading" | "supplement";
  material_id: string | null;
  text: string;
  done: boolean;
  revision: number;
};
export type ItemInput = Omit<ResearchItem, "company_id" | "revision" | "id"> & {
  id: string | null;
  expected_revision: number;
};
type Invoker = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
export function createDashboardApi(native = isTauri(), call: Invoker = invoke) {
  async function request<T>(
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!native) throw new Error("指标看板仅在原生桌面可读写，浏览器只预览");
    return call<T>(cmd, args);
  }
  return {
    load: () => request<DashboardSaved>("dashboard_load", {}),
    save: (config: DashboardConfig, expectedRevision: number) =>
      request<DashboardSaved>("dashboard_save", { config, expectedRevision }),
    items: (companyId: string) =>
      request<ResearchItem[]>("dashboard_items", { companyId }),
    putItem: (companyId: string, input: ItemInput) =>
      request<ResearchItem>("dashboard_put_item", { companyId, input }),
  };
}
