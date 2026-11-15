// Stamps public/index.html with a version made from the app's files, so phones always fetch fresh copies after an update
// (Cloudflare lets browsers keep scripts for 4 hours otherwise). Run:  node tools/stamp.mjs   (the tests fail if you forget)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
export const FILES = ["app.js", "logic.js", "cloud.js", "config.js", "shop.js", "examguides.js", "style.css"];
export const MODULES = ["logic.js", "cloud.js", "config.js", "shop.js", "examguides.js"];
export const versionOf = () => {
  const h = createHash("sha1");
  for (const f of FILES) h.update(f).update(readFileSync(path.join(pub, f)));
  return h.digest("hex").slice(0, 8);
};
export const stamped = (html, v) => html
  .replace(/[ ]*<script type="importmap">[\s\S]*?<\/script>\n?/, "")
  .replace(/(<link rel="stylesheet" href="style\.css)(\?v=[0-9a-f]+)?"/, `$1?v=${v}"`)
  .replace(/<script type="module" src="app\.js(\?v=[0-9a-f]+)?"><\/script>/, `<script type="importmap">{"imports":{${MODULES.map((m) => `"./${m}":"./${m}?v=${v}"`).join(",")}}}</script>\n  <script type="module" src="app.js?v=${v}"></script>`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(pub, "index.html");
  const html = readFileSync(file, "utf8");
  const next = stamped(html, versionOf());
  if (next !== html) writeFileSync(file, next);
  console.log("index.html stamped with version", versionOf());
}
