import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import { SITE_ASSETS } from "../scripts/build.mjs";

const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...await filesBelow(new URL(`${entry.name}/`, directory), relative));
    } else {
      paths.push(relative);
    }
  }
  return paths.sort();
}

await execFileAsync(process.execPath, ["scripts/build.mjs"], { cwd: root });

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const readmeWorkflow = await readFile(new URL("../.github/workflows/readme-standard.yml", import.meta.url), "utf8");
const prTemplate = await readFile(new URL("../.github/pull_request_template.md", import.meta.url), "utf8");
const wrangler = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));

test("production build publishes only the explicit site allowlist", async () => {
  assert.deepEqual(await filesBelow(dist), [...SITE_ASSETS].sort());
  for (const asset of SITE_ASSETS) {
    assert.deepEqual(
      await readFile(new URL(asset, dist)),
      await readFile(new URL(`../${asset}`, import.meta.url)),
      `${asset} must be copied byte-for-byte`,
    );
  }
  for (const privatePath of [
    "README.md",
    "package.json",
    "CNAME",
    ".git",
    ".github",
    "tests",
    "scripts",
    "wrangler.jsonc",
  ]) {
    await assert.rejects(stat(new URL(privatePath, dist)), { code: "ENOENT" });
  }
});

test("the build has no Pages mode, and never emits a CNAME", async () => {
  /* This asserted the opposite until 2026-08-01: that `--pages` added a CNAME
     claiming tempoladder.backwerdrhythmshop.com. DNS routes that hostname to
     the Cloudflare Worker, so the Pages copy it was built for could never serve
     it — and the green "Deploy to GitHub Pages" run on every merge is what
     disguised a production deploy that was not happening.

     The flag is passed here deliberately. It is not an error any more, just
     inert, and an old habit or a stale script must not quietly resurrect a
     second deploy artifact. */
  await execFileAsync(process.execPath, ["scripts/build.mjs", "--pages"], { cwd: root });
  assert.deepEqual(await filesBelow(dist), [...SITE_ASSETS].sort());
  await assert.rejects(stat(new URL("CNAME", dist)), { code: "ENOENT" });
});

test("PWA metadata and icon files retain their public paths", () => {
  assert.equal(manifest.name, "Tempo Ladder");
  assert.equal(manifest.short_name, "Tempo Ladder");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(
    manifest.icons.map(({ src, sizes, type, purpose }) => ({ src, sizes, type, purpose })),
    [
      { src: "./icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "./icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  );
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /href="\.\/favicon\.svg"/);
  assert.match(html, /href="\.\/apple-touch-icon\.png"/);
  assert.match(html, /src="\.\/icon-192\.png"/);
  for (const script of ["tempoladder-core.js", "tempoladder-link.js", "tempoladder-app.js"]) {
    assert.match(html, new RegExp(`src="js/${script.replace(".", "\\.")}"`));
  }
});

test("legal, guide, support, and social destinations remain intact", () => {
  for (const expected of [
    "© 2026 Backwerd Rimshot, LLC. All rights reserved.",
    "https://guides.backwerdrhythmshop.com/tempo-ladder/",
    'href="https://backwerdrhythmshop.com"',  // the footer wordmark links the shop's front door

    "support@backwerdrhythmshop.com",
    "feedback@backwerdrhythmshop.com",
    "https://www.facebook.com/backwerdrhythmshop/",
    "https://www.instagram.com/backwerdrhythmshop/",
    "https://www.youtube.com/@backwerdrhythmshop",
  ]) {
    assert.ok(html.includes(expected), `index.html must contain ${expected}`);
  }
});

test("tempo, direction, transport, and Web Audio behavior remain client-only", async () => {
  const app = await readFile(new URL("../js/tempoladder-app.js", import.meta.url), "utf8");
  const core = await readFile(new URL("../js/tempoladder-core.js", import.meta.url), "utf8");
  for (const expected of [
    "window.AudioContext || window.webkitAudioContext",
    "audio.createOscillator()",
    "audio.createGain()",
    "function startSession()",
    "function pauseSession()",
    "function resumeSession()",
    "function stopSession()",
    "function resetToSetup()",
    "btnPause",
    "btnReset",
  ]) {
    assert.ok(app.includes(expected), `application code must contain ${expected}`);
  }
  for (const expected of ["climbing", "peak", "descending", "advanceMeasure", "reset"]) {
    assert.ok(core.includes(expected), `core code must contain ${expected}`);
  }
  assert.equal(wrangler.name, "tempo-ladder");
  assert.equal(wrangler.main, undefined);
  assert.equal(wrangler.routes, undefined);
  assert.equal(wrangler.assets.directory, "./dist");
  assert.equal(wrangler.assets.not_found_handling, "none");
  assert.equal(wrangler.workers_dev, true);
  assert.equal(wrangler.preview_urls, true);
});

test("README validation remains useful without forcing app-change build bumps", () => {
  const requiredHeadings = [
    "## Release information",
    "## Local development",
    "## Testing",
    "## Privacy and accessibility",
    "## Deployment",
    "## Support and feedback",
    "## Ownership",
  ];
  requiredHeadings.forEach((heading) => assert.ok(readme.includes(heading)));
  assert.match(readmeWorkflow, /README must contain exactly one build identifier/);
  assert.match(readmeWorkflow, /Build date is not present in app code/);
  assert.doesNotMatch(readmeWorkflow, /App changes require a new build identifier/);
  assert.doesNotMatch(prTemplate, /changed if the shipped app changed/);
});

/* The shop site's Worker injects this beacon in one place for every page it
   serves, and it does not serve this host. tempoladder.backwerdrhythmshop.com is
   its own deployment, so nothing upstream notices if the tag goes missing.

   The token is written out literally rather than read from a constant. A
   wrong-but-present token is the failure that costs most: the beacon loads, the
   page looks right, nothing errors, and the views land in someone else's
   dashboard or nowhere at all. Only a literal catches that. */
const BEACON = /<script[^>]*src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"[^>]*><\/script>/;

test("the analytics beacon ships, with the shared site token", () => {
  const tag = html.match(BEACON);
  assert.ok(tag, "index.html must carry the beacon as a real script element");
  assert.match(tag[0], /4c76fa6f3023401899bbeb30fa4eebd3/);
  assert.match(tag[0], /type="module"/, "module scripts defer without blocking the parser");
});

/* The build copies an explicit allowlist into dist/, so a tag present in the
   source is not proof of a tag in the shipped page. This is the file a browser
   actually receives. */
test("the built page still carries the beacon", async () => {
  const built = await readFile(new URL("index.html", dist), "utf8");
  const tag = built.match(BEACON);
  assert.ok(tag, "dist/index.html must carry the beacon — the build dropped it");
  assert.match(tag[0], /4c76fa6f3023401899bbeb30fa4eebd3/);
});

/* The beacon reports pages. It must never become a route for a climb, a tempo or
   a remembered setting — that is the promise the README's Privacy section makes
   and the one /privacy/ makes on this app's behalf. */
test("the analytics beacon carries nothing but its token", () => {
  const config = html.match(BEACON)[0].match(/data-cf-beacon='([^']*)'/);
  assert.ok(config, "the beacon must declare a data-cf-beacon config");
  assert.deepEqual(JSON.parse(config[1]), { token: "4c76fa6f3023401899bbeb30fa4eebd3" });
});
