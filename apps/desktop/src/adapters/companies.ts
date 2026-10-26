import { invoke, isTauri } from "@tauri-apps/api/core";
export type CompanyMarket = "a" | "hk" | "us" | "private";
export type ListingMarket = Exclude<CompanyMarket, "private">;
export type ListingInput = {
  market: ListingMarket;
  code: string;
  exchange: string;
  security_type: string;
};
export type CompanyInput = {
  name: string;
  market: CompanyMarket;
  registration: string;
  listings: ListingInput[];
};
export type Listing = ListingInput & {
  id: string;
  company_id: string;
  created_at: string;
};
export type Company = Omit<CompanyInput, "listings"> & {
  id: string;
  created_at: string;
  listings: Listing[];
};
export type DuplicateWarning = {
  message: string;
  company_id: string;
  company_name: string;
};
export type SaveResult<T> =
  | { kind: "saved"; record: T }
  | { kind: "needs_confirmation"; warnings: DuplicateWarning[] };
type Invoker = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;
export function createCompanyApi(native = isTauri(), call: Invoker = invoke) {
  async function request<T>(
    command: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    if (!native)
      throw new Error(
        "本地公司档案仅在 Tauri 桌面窗口中可用，浏览器预览不能读写。",
      );
    return call<T>(command, args);
  }
  return {
    list: (query: string) => request<Company[]>("company_list", { query }),
    get: (id: string) => request<Company>("company_get", { id }),
    create: (input: CompanyInput, confirm: boolean) =>
      request<SaveResult<Company>>("company_create", {
        input,
        confirmDuplicates: confirm,
      }),
    addListing: (companyId: string, input: ListingInput, confirm: boolean) =>
      request<SaveResult<Listing>>("listing_add", {
        companyId,
        input,
        confirmDuplicates: confirm,
      }),
  };
}
