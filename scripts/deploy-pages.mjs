import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

function run(command, args, cwd = process.cwd()) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed.`);
}

run("npm", ["run", "build"]);
const worktree = await mkdtemp(join(tmpdir(), "universe-model-pages-"));
try {
  run("git", ["worktree", "add", "--detach", worktree, "HEAD"]);
  run("git", ["checkout", "--orphan", "gh-pages"], worktree);
  run("git", ["rm", "-rf", "."], worktree);
  await cp(new URL("../dist/", import.meta.url), worktree, { recursive: true, force: true });
  await writeFile(join(worktree, ".nojekyll"), "", "utf8");
  run("git", ["add", "-A"], worktree);
  run("git", ["commit", "-m", "deploy: static GitHub Pages build"], worktree);
  run("git", ["push", "origin", "HEAD:gh-pages", "--force"], worktree);
} finally {
  run("git", ["worktree", "remove", "--force", worktree]);
  await rm(worktree, { recursive: true, force: true });
}
