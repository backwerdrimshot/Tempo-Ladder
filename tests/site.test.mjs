import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import vm from "node:vm";

import { SITE_ASSETS } from "../scripts/build.mjs";

/* Retired on 2026-10-01. This address serves one page, which sends old links
   and home-screen icons on to Pulse Pocket's tempo ramp with the same climb. */
const execFileAsync = promisify(execFile);
const root = new URL("../", import.meta.url);
const dist = new URL("../dist/", import.meta.url);

await execFileAsync(process.execPath, ["scripts/build.mjs"], { cwd: root });

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const manifest = await readFile(new URL("../manifest.webmanifest", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function forwarder() {
  const context = vm.createContext({ URLSearchParams });
  new vm.Script(script + "\nglobalThis.__f = { pulseUrl, STORE_KEY };").runInContext(context);
  return context.__f;
}

const PP = "https://pulse.backwerdrhythmshop.com/";

test("the build publishes only the forwarding page and its icons", async () => {
  const published = (await readdir(dist, { recursive: true })).sort();
  assert.deepEqual(published, [...SITE_ASSETS].sort());
});

test("an old link opens Pulse Pocket with the same climb", () => {
  const { pulseUrl } = forwarder();
  assert.equal(pulseUrl("?start=60&peak=100&step=5&measures=8&mode=step", null),
    PP + "?meter=4/4&bpm=60&ramp=100&rampstep=5&rampbars=8&rampend=back&rest=on");
  assert.equal(pulseUrl("?start=72&peak=140&step=4&measures=16&mode=nonstop&label=Line%204", null),
    PP + "?name=Line%204&meter=4/4&bpm=72&ramp=140&rampstep=4&rampbars=16&rampend=back&rest=off",
    "Nonstop has no rest bars, and the label becomes the setup's name");
});

test("no link: the settings this browser last used here, else the old defaults", () => {
  const { pulseUrl, STORE_KEY } = forwarder();
  assert.equal(STORE_KEY, "tempoladder-settings", "the key the old app saved under");
  assert.equal(pulseUrl("", null), PP + "?meter=4/4&bpm=60&ramp=100&rampstep=5&rampbars=8&rampend=back&rest=on");
  const stored = { startBpm: 80, peakBpm: 120, stepBpm: 10, measuresPerTempo: 4, mode: "nonstop", label: "Rolls" };
  assert.equal(pulseUrl("", stored), PP + "?name=Rolls&meter=4/4&bpm=80&ramp=120&rampstep=10&rampbars=4&rampend=back&rest=off");
  assert.equal(pulseUrl("?peak=150", stored), PP + "?name=Rolls&meter=4/4&bpm=80&ramp=150&rampstep=10&rampbars=4&rampend=back&rest=off",
    "a link wins over remembered settings, field by field");
});

test("an unreadable value leaves the previous layer's", () => {
  const { pulseUrl } = forwarder();
  assert.equal(pulseUrl("?start=fast&peak=999&step=0&measures=5&mode=sideways&label=%01%01", null),
    PP + "?meter=4/4&bpm=60&ramp=300&rampstep=1&rampbars=8&rampend=back&rest=on");
  assert.equal(pulseUrl("", "junk"), PP + "?meter=4/4&bpm=60&ramp=100&rampstep=5&rampbars=8&rampend=back&rest=on");
  const long = "x".repeat(90);
  assert.match(pulseUrl("?label=" + long, null), new RegExp("name=" + "x".repeat(40) + "&"), "a name as long as Pulse Pocket keeps");
});

test("the page forwards at once, is not indexed, and names nothing of the old app", () => {
  assert.match(html, /location\.replace\(url\)/);
  assert.match(html, /<meta name="robots" content="noindex" \/>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pulse\.backwerdrhythmshop\.com\/" \/>/);
  const visible = html.replace(/<script>[\s\S]*?<\/script>/, "").replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(visible, /tempo\s*ladder/i);
  assert.doesNotMatch(manifest, /tempo\s*ladder/i);
});
