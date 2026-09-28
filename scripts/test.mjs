import { rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await rm(new URL("../.test-dist", import.meta.url), { recursive: true, force: true });

const compile = spawnSync("tsc", ["-p", "tsconfig.test.json"], { stdio: "inherit", shell: process.platform === "win32" });
if (compile.status !== 0) process.exit(compile.status ?? 1);

const tests = spawnSync(process.execPath, ["--test", "test/core.test.mjs"], { stdio: "inherit" });
process.exit(tests.status ?? 1);
