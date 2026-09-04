import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildStamp, capabilities } from "./capabilities.mjs";

export const SITE_ASSETS = Object.freeze([
  "index.html",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "js/tempoladder-core.js",
  "js/tempoladder-link.js",
  "js/tempoladder-app.js",
  /* The brand token file and the self-hosted faces, served so the token file
     matches the site's byte for byte. */
  "assets/brand/design-tokens.css",
  "assets/fonts/big-shoulders-display-800-latin.woff2",
  "assets/fonts/big-shoulders-display-OFL.txt",
  "assets/fonts/barlow-condensed-400-latin.woff2",
  "assets/fonts/barlow-condensed-600-latin.woff2",
  "assets/fonts/barlow-condensed-700-latin.woff2",
  "assets/fonts/barlow-condensed-OFL.txt",
]);

/* Written by the build rather than copied from the tree, and therefore not in
   SITE_ASSETS — but still published, so it is declared here and the allowlist
   test stays exhaustive. A generated file that no list names is how an
   artifact quietly grows. */
export const GENERATED_ASSETS = Object.freeze(["capabilities.json"]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");

/* The `pages` option is gone with the GitHub Pages deploy. It existed only to
   copy CNAME into dist, and that CNAME claimed the same hostname the Cloudflare
   Worker already serves — so Pages published a full second copy of this app
   that DNS never routed to. */
export async function buildSite() {
  const assets = SITE_ASSETS;
  await rm(output, { recursive: true, force: true });
  await Promise.all(
    assets.map(async (asset) => {
      const target = join(output, asset);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, asset), target);
    }),
  );
  /* The capability manifest is GENERATED, never committed, and its version is
     read out of index.html rather than typed here. A committed manifest would
     be a third copy of the build identifier that README.md and the page
     already carry between them; a generated one cannot disagree with the page
     it came from. It is not in SITE_ASSETS because nothing in the app
     references it — it is fetched by the shop site's guide-build audit, which
     cannot check an app that publishes no version. */
  const stamp = buildStamp(await readFile(join(root, "index.html"), "utf8"));
  await writeFile(
    join(output, "capabilities.json"),
    JSON.stringify(capabilities(stamp), null, 2) + "\n",
  );

  console.log(`Built ${assets.length} static assets in dist, and capabilities.json for build ${stamp}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
