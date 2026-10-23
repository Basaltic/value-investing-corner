import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// Verification only: override env-file values for the child process, never edit credentials.
export function localEnvironment(env) {
  return {
    ...env,
    ALGOLIA_APP_ID: "",
    NEXT_PUBLIC_ALGOLIA_APP_ID: "",
    ALGOLIA_SEARCH_API_KEY: "",
    NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY: "",
    NEXT_PUBLIC_ALGOLIA_SEARCH_KEY: "",
    ALGOLIA_WRITE_KEY: "",
    ALGOLIA_WRITE_API_KEY: "",
    ALGOLIA_SKIP_SYNC: "true",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const mode = process.argv[2];
  const scripts = { check: "check", build: "build:web" };
  if (!Object.hasOwn(scripts, mode)) {
    console.error("用法：node scripts/verify-local.mjs check|build");
    process.exitCode = 1;
  } else {
    const result = spawnSync("corepack", ["pnpm", scripts[mode]], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: localEnvironment(process.env),
      stdio: "inherit",
    });
    if (result.error) console.error(result.error.message);
    process.exitCode = result.status ?? 1;
  }
}
