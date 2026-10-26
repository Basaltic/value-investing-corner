import { invoke, isTauri } from "@tauri-apps/api/core";
export type MaterialInput = {
  title: string;
  body: string;
  url: string;
  tags: string[];
};
export type Material = MaterialInput & {
  id: string;
  company_id: string;
  kind: "note" | "link" | "file";
  file_mode: "" | "copy" | "reference";
  original_name: string;
  file_size: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  csv_mapping: string[];
};
export type MaterialPreview = {
  kind: string;
  status: string;
  text: string;
  bytes: number[];
  mime: string;
  headers: string[];
  rows: string[][];
  total_rows: number;
};
type Invoker = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;
export function createMaterialApi(native = isTauri(), call: Invoker = invoke) {
  async function request<T>(
    command: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!native)
      throw new Error(
        "资料库仅在 Tauri 桌面窗口中可用，浏览器不能读写本地文件。",
      );
    return call<T>(command, args);
  }
  return {
    list: (companyId: string, query: string, archived: boolean) =>
      request<Material[]>("material_list", { companyId, query, archived }),
    get: (id: string) => request<Material>("material_get", { id }),
    create: (companyId: string, kind: "note" | "link", input: MaterialInput) =>
      request<Material>("material_create", { companyId, kind, input }),
    importFile: (
      companyId: string,
      mode: "copy" | "reference",
      input: MaterialInput,
    ) =>
      request<Material | null>("material_import_file", {
        companyId,
        mode,
        input,
      }),
    preview: (id: string) =>
      request<MaterialPreview>("material_preview", { id }),
    update: (id: string, input: MaterialInput) =>
      request<Material>("material_update", { id, input }),
    archive: (id: string, archived: boolean) =>
      request<Material>("material_archive", { id, archived }),
    relocate: (id: string) =>
      request<Material | null>("material_relocate", { id }),
    reveal: (id: string) => request<void>("material_reveal", { id }),
    openSource: (id: string) => request<void>("material_open_source", { id }),
    mapping: (id: string, mapping: string[]) =>
      request<Material>("material_csv_mapping", { id, mapping }),
  };
}
