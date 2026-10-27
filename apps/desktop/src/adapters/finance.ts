import { invoke, isTauri } from "@tauri-apps/api/core";
export type FactInput = {
  metric: string;
  value: number | null;
  currency: string;
  unit: string;
  period_kind: string;
  period_start: string;
  period_end: string;
  standard: string;
  scope: string;
  basis: string;
  reviewed: boolean;
  source: string;
  tags: string[];
};
export type DefinitionInput = {
  name: string;
  value_type: "number" | "text";
  currency: string;
  unit: string;
  basis: string;
};
export type ObservationInput = {
  definition_id: string;
  date: string;
  numeric_value: number | null;
  text_value: string | null;
  reviewed: boolean;
  source: string;
  tags: string[];
};
export type Version<T> = {
  id: string;
  company_id: string;
  series_id: string;
  version: number;
  created_at: string;
  input: T;
};
export type Definition = {
  id: string;
  company_id: string;
  input: DefinitionInput;
};
export type Derived = {
  id: string;
  metric: string;
  formula_version: string;
  context: FactInput;
  input_ids: string[];
  value: number | null;
  issue: string;
};
export type FinanceState = {
  facts: Version<FactInput>[];
  definitions: Definition[];
  observations: Version<ObservationInput>[];
  derived: Derived[];
  derived_history: Derived[];
};
type Invoker = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
export function createFinanceApi(native = isTauri(), call: Invoker = invoke) {
  async function request<T>(
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!native)
      throw new Error("手工财务与指标仅在原生桌面中可读写，浏览器只预览");
    return call<T>(cmd, args);
  }
  return {
    state: (companyId: string) =>
      request<FinanceState>("finance_state", { companyId }),
    saveFact: (companyId: string, input: FactInput, baseId: string | null) =>
      request<Version<FactInput>>("finance_save_fact", {
        companyId,
        input,
        baseId,
      }),
    define: (companyId: string, input: DefinitionInput) =>
      request<Definition>("finance_define", { companyId, input }),
    observe: (
      companyId: string,
      input: ObservationInput,
      baseId: string | null,
    ) =>
      request<Version<ObservationInput>>("finance_observe", {
        companyId,
        input,
        baseId,
      }),
  };
}
