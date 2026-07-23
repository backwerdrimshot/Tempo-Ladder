# Tempo Ladder — by Backwerd Rhythm Shop

**One exercise. One controlled climb. One controlled descent.**

Tempo Ladder guides a percussionist through a single symmetric **slow → fast →
slow** tempo sequence while the student plays a rudiment, exercise, excerpt,
scale, or any other material *outside* the app. Tempo Ladder manages the tempo;
you bring the music.

Sibling app to [Pulse Pocket Metronome](https://pulse.backwerdrhythmshop.com/),
[Click Drop](https://clickdrop.backwerdrhythmshop.com/), and
[Grid Board](https://gridboard.backwerdrhythmshop.com/).

## Release information

- **Build:** `2026-07-22`
- **Status:** Live
- **Live app:** <https://tempoladder.backwerdrhythmshop.com/>
- **Public app guide:** <https://www.backwerdrhythmshop.com/app-guides/tempo-ladder>
- **Repository:** <https://github.com/backwerdrimshot/Tempo-Ladder>

Build identifiers use ISO `YYYY-MM-DD`, based on the date the shipped app update
began. The value stays fixed while that release pass is completed across code and
documentation.

## Privacy and accessibility

Tempo Ladder requires no account or backend. Settings stay in the browser's local
storage. The app supports keyboard controls, visible focus, reduced motion, phone and
tablet layouts, classroom displays, and a best-effort screen wake lock while playing.

## Local development

It's a self-contained web app — no install, no build step, no internet needed.

- **Double-click `index.html`** — it opens in your default browser and works
  fully, audio included (Chrome, Edge, Firefox, Safari).
- Or serve it locally (handy for phones on the same network):

  ```powershell
  powershell -ExecutionPolicy Bypass -File serve.ps1
  ```

  then open <http://localhost:8433/>.

## What it does

You set five things and press **Start**:

| Control | Default | Notes |
|---|---|---|
| Starting BPM | 60 | The tempo at both ends of the ladder |
| Peak BPM | 100 | Played exactly once, at the apex |
| BPM step | 5 | Size of each rung |
| Measures per tempo | 8 | 4, 8, or 16 |
| Mode | Step | **Step** or **Nonstop** |

Fixed for the MVP: **4/4**, quarter-note click, accented beat one, and a
one-measure **count-in** at the starting tempo.

### The ladder

Tempo Ladder always builds one symmetric path — the start tempo bookends it, the
peak is hit once, and the descent retraces the ascent:

```
60 → 65 → 70 → 75 → 80 → 75 → 70 → 65 → 60
```

If the step doesn't land exactly on the peak, the exact peak is still included
and the return stays symmetric over the rungs actually visited:

```
buildLadder({ startBpm: 60, peakBpm: 72, stepBpm: 5 })  ->  [60, 65, 70, 72, 70, 65, 60]
```

### Step Mode

Between played rungs, Step Mode inserts **exactly one click-only measure** — a
short physical reset that also counts you into the new tempo. It clicks at the
**upcoming** tempo, not the previous one:

> Listen — next tempo: 65 BPM

Those click-only measures (and the opening count-in) use a softer, warmer click
than the played measures, so you *hear* "count / reset — don't play yet" without
having to watch the screen.

### Nonstop Mode

You play straight through the whole ladder. There's no reset measure; the tempo
changes on the next measure boundary, and the final measure before each change
shows a warning:

> Tempo change next measure → 65 BPM

### Small conveniences

- **Remembered settings** — your last-used values come back next time (stored
  locally in the browser; nothing leaves the device).
- **Shareable link** — **Copy link** puts a URL on your clipboard that opens the
  setup pre-filled with the current climb, e.g.
  `…/index.html?start=60&peak=100&step=5&measures=8&mode=step`. Hand one to a
  student and they get exactly the ladder you set. A shared link wins over
  remembered settings.
- **Stays awake** — while a session plays, the screen is kept from sleeping
  (best-effort, where the browser supports it) so a phone on a music stand
  doesn't dim mid-climb.

## Architecture

Layered exactly like Click Drop, so the musical logic is testable without a
browser or speakers:

1. **Ladder construction** — `buildLadder()` (pure)
2. **Playback-position machine** — `createLadderPlayback()` (pure)
3. **Web Audio scheduler** — a lookahead scheduler on the `AudioContext`
   timeline (the single source of truth for *when* beats happen)
4. **Timestamped visual-event queue** — keeps the display synced to what's heard
5. **DOM rendering**

Layers 1–2 live in [`js/tempoladder-core.js`](js/tempoladder-core.js) with no DOM
or audio. Layers 3–5 live in [`js/tempoladder-app.js`](js/tempoladder-app.js).
Tempo changes are baked into the scheduled audio timeline — never an imprecise
UI timer flipping a BPM variable after the fact.

## Testing

The pure ladder and playback logic are covered by runner-agnostic cases in
[`tests/cases.js`](tests/cases.js):

- **In a browser:** open [`tests/test.html`](tests/test.html) — no tooling needed.
- **With Node:** `node --test tests/`

They verify the required behavior: the `60,65,70,65,60` example, an off-grid
peak included exactly once, the start tempo at both ends, one Step-Mode
transition per rung at the *upcoming* tempo, no Nonstop transitions, tempo
changes only at measure boundaries, pause/resume position integrity, reset,
snapshot coherence, and no timing drift over a full ladder.

## What Tempo Ladder is *not*

No notation, exercise library, sticking, rhythm building, counting systems,
disappearing clicks, custom subdivisions or accents, extra meters, grading,
scores, badges, challenges, accounts, or practice history. It manages tempo
progression; the student or teacher supplies the musical content.

## Deployment

The static repository includes a `CNAME` for `tempoladder.backwerdrhythmshop.com`.
Production publishing is configured outside a committed Actions workflow.

## Support and feedback

- **Report a problem** emails `support@backwerdrhythmshop.com`.
- **Request a feature** emails `feedback@backwerdrhythmshop.com`.
- Both controls are available in the app footer and prefill the app name, build,
  page URL, and browser details to make follow-up easier.

## Ownership

© Backwerd Rimshot, LLC
