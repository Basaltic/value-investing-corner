import { invoke, isTauri } from "@tauri-apps/api/core";

type AppInfo = { name: string; version: string };
export type NativeInfo =
  | ({ kind: "native" } & AppInfo)
  | { kind: "browser" }
  | { kind: "error"; message: string };

export async function getNativeInfo(
  native = isTauri(),
  load: () => Promise<AppInfo> = () => invoke<AppInfo>("app_info"),
): Promise<NativeInfo> {
  if (!native) return { kind: "browser" };
  try {
    const info = await load();
    return { kind: "native", ...info };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
