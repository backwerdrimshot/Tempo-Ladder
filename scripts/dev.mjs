import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, SITE_ASSETS } from "./build.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let rebuilding = false;
let rebuildQueued = false;

async function rebuild() {
  if (rebuilding) {
    rebuildQueued = true;
    return;
  }
  rebuilding = true;
  try {
    await buildSite();
  } catch (error) {
    console.error(error.message);
  } finally {
    rebuilding = false;
    if (rebuildQueued) {
      rebuildQueued = false;
      void rebuild();
    }
  }
}

await buildSite();

const watchers = SITE_ASSETS.map((asset) =>
  watch(join(root, asset), { persistent: true }, () => void rebuild()),
);

const wrangler = spawn(
  process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  ["dev", "--live-reload"],
  { cwd: root, stdio: "inherit" },
);

function stop(signal) {
  watchers.forEach((watcher) => watcher.close());
  wrangler.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
wrangler.once("exit", (code) => process.exit(code ?? 0));
