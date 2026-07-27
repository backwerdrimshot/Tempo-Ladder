import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

const inlineScriptPattern = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const inlineScripts = [...html.matchAll(inlineScriptPattern)].filter((match) => match[1].trim());
assert.ok(inlineScripts.length > 0, "index.html must contain inline JavaScript");
inlineScripts.forEach((match, index) =>
  new vm.Script(match[1], { filename: `index.inline-${index + 1}.js` }),
);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, "index.html must not contain duplicate ids");
assert.match(html, /^<!doctype html>/i, "index.html must declare HTML5");
assert.equal(manifest.start_url, "./", "manifest start_url must remain path-safe");
assert.equal(manifest.scope, "./", "manifest scope must remain path-safe");
assert.equal(wrangler.assets.directory, "./dist", "Wrangler must serve only the build output");
assert.equal(wrangler.assets.not_found_handling, "none", "unknown files must return 404");
assert.equal(wrangler.main, undefined, "the static site must not add a Worker script");
assert.equal(wrangler.routes, undefined, "the custom domain must not be attached before cutover approval");

console.log(
  `Validated ${inlineScripts.length} inline scripts, ${ids.length} unique ids, PWA paths, and static-only Wrangler config.`,
);
