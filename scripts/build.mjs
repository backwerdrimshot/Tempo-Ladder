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

export async function buildSite({ pages = false } = {}) {
  const assets = pages ? [...SITE_ASSETS, "CNAME"] : SITE_ASSETS;
  await rm(output, { recursive: true, force: true });
  await Promise.all(
    assets.map(async (asset) => {
      const target = join(output, asset);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(root, asset), target);
    }),
  );
  console.log(`Built ${assets.length} static assets in dist${pages ? " for GitHub Pages" : ""}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite({ pages: process.argv.includes("--pages") });
}
