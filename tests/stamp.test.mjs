import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { versionOf, stamped } from "../tools/stamp.mjs";

test("index.html carries the current version, so phones fetch fresh files after an update (run: node tools/stamp.mjs)", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.equal(stamped(html, versionOf()), html);
  assert.match(html, /<script type="importmap">/);
  assert.match(html, /"\.\/logic\.js":"\.\/logic\.js\?v=[0-9a-f]{8}"/);
});
