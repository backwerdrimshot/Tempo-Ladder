import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SITE_ASSETS = Object.freeze([
  "index.html",
  "manifest.webmanifest",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "js/tempoladder-core.js",
  "js/tempoladder-link.js",
  "js/tempoladder-app.js",
]);

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
  console.log(`Built ${assets.length} static assets in dist.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
