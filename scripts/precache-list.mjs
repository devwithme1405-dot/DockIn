/**
 * After `next build`: list every script, style and font of this build in
 * .next/static/dockin-precache.json, so the service worker can save the WHOLE
 * app for offline — including parts nobody has opened yet (a sheet, a tool).
 * The worker also finds files on its own by following references, so if this
 * list is ever missing nothing breaks; it is the belt to those braces.
 */
import { readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
if (!existsSync(root)) process.exit(0);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|woff2?)$/.test(name)) files.push("/_next/static/" + p.slice(root.length + 1).split("\\").join("/"));
  }
})(root);
writeFileSync(join(root, "dockin-precache.json"), JSON.stringify(files));
console.log(`precache list: ${files.length} files`);
