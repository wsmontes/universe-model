import { copyFile, cp, mkdir, writeFile } from "node:fs/promises";

const dist = new URL("../dist/", import.meta.url);
await mkdir(dist, { recursive: true });
await copyFile(new URL("../index.html", import.meta.url), new URL("../dist/index.html", import.meta.url));
await copyFile(new URL("../src/styles.css", import.meta.url), new URL("../dist/styles.css", import.meta.url));
await cp(new URL("../static", import.meta.url), dist, { recursive: true, force: true });
await writeFile(new URL("../dist/.nojekyll", import.meta.url), "", "utf8");
console.log("Static site built in dist/. No runtime server is required.");
