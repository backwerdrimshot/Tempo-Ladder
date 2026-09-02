import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
