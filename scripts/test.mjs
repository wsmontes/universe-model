import { readdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await rm(new URL("../.test-dist", import.meta.url), {
  recursive: true,
  force: true,
});

const compile = spawnSync(
  "tsc",
  ["-p", "tsconfig.test.json"],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);
if (compile.status !== 0) {
  process.exit(compile.status ?? 1);
}

const testDirectory = new URL("../test/", import.meta.url);
const testFiles = (await readdir(testDirectory))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => new URL(name, testDirectory).pathname);

if (testFiles.length === 0) {
  throw new Error("No test/*.test.mjs files were found.");
}

const tests = spawnSync(
  process.execPath,
  ["--test", ...testFiles],
  { stdio: "inherit" },
);
process.exit(tests.status ?? 1);
