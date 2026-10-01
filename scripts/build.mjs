import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* Retired on 2026-10-01: this address now serves only a page that sends old
   links and home-screen icons on to Pulse Pocket's tempo ramp. The app, its
   brand files and fonts, its sitemap and capabilities.json are gone. */
export const SITE_ASSETS = Object.freeze([
  "index.html",
  "robots.txt",
  "manifest.webmanifest",
  "favicon.svg",
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
]);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");

export async function buildSite() {
  await rm(output, { recursive: true, force: true });
  await Promise.all(
    SITE_ASSETS.map(async (asset) => {
      const target = join(output, asset);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, asset), target);
    }),
  );
  console.log(`Built ${SITE_ASSETS.length} static assets in dist.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
