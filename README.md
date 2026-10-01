# Retired — now part of Pulse Pocket Metronome

The standalone slow–fast–slow tempo app this repository built was **retired on
2026-10-01**. Everything it did is now Pulse Pocket Metronome's **tempo ramp**
(Practice Tools → Tempo ramp), from Pulse Pocket build `2026-10-01`:

| The old app | Pulse Pocket's tempo ramp |
|---|---|
| Starting BPM | The tempo set when the ramp starts (`bpm`) |
| Peak BPM | Target tempo (`ramp`) |
| BPM step | Change by (`rampstep`) |
| Measures per tempo (4, 8, 16) | Every … bars (`rampbars`, 1–64) |
| One climb and one descent, peak played once | At the target: **Come back, then stop** (`rampend=back`) |
| Step mode's click-only reset measure | **Rest bar before each tempo** (`rest=on`) |
| Nonstop mode | Rest bars off (`rest=off`) |
| "What are you playing?" label | The setup's name (`name`) |
| Copy link | Copy link, in the ramp's own controls |

## What this repository serves now

`tempoladder.backwerdrhythmshop.com` serves one page, [`index.html`](index.html),
which sends every visit on to <https://pulse.backwerdrhythmshop.com/> with the same
climb ready to start, so shared links and home-screen icons keep working:

```
/?start=60&peak=100&step=5&measures=8&mode=step&label=Line%204
  -> https://pulse.backwerdrhythmshop.com/?name=Line%204&meter=4/4&bpm=60
       &ramp=100&rampstep=5&rampbars=8&rampend=back&rest=on
```

As the old app did, a link wins over the settings that browser last used here
(`tempoladder-settings` in local storage), which win over the old defaults, field by
field. The page is `noindex`, its canonical address is Pulse Pocket's, and its icons
and manifest are Pulse Pocket's. It loads no analytics, counter, fonts or other
scripts.

## Local development and testing

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs the lint and workflow checks, the forwarding tests in
[`tests/site.test.mjs`](tests/site.test.mjs), a production build of `dist/`, and a
Wrangler deployment dry run. `pnpm dev` serves the page locally.

## Deployment

Cloudflare Workers Static Assets serves `dist/` as the `tempo-ladder` Worker
(`wrangler.jsonc`); `pnpm deploy` builds and deploys it, and where GitHub Actions
still runs, a merge to `main` that passes **Validate static site** deploys it through
`workers.yml`. Merge and deploy this only **after** Pulse Pocket build `2026-10-01`
is live, or old links will land on a Pulse Pocket that cannot read their ramp.

Once old links have stopped arriving (the Worker's request count in the Cloudflare
dashboard shows it), the Worker and its custom domain can be deleted in the
Cloudflare dashboard and this repository archived on GitHub. Neither step can be
taken from this repository.

## Ownership

© 2026 Backwerd Rimshot, LLC. All rights reserved.
