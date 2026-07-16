/* Tempo Ladder — sequence core.
   Pure data + logic: symmetric ladder construction and the measure-level
   playback-position machine. No DOM, no Web Audio — the browser page and the
   Node tests both load this file.

   One exercise. One controlled climb. One controlled descent.

   Classic script (works over file://); exports for Node at the bottom.
   Layering (mirrors Click Drop):
     1. buildLadder            — pure rung array
     2. createLadderPlayback   — pure position machine (this file)
     3. Web Audio scheduler    — index.html
     4. timestamped visual queue — index.html
     5. DOM rendering          — index.html                                   */
(function (root) {
"use strict";

var BEATS_PER_MEASURE = 4; // MVP is 4/4 only — the one constant a future meter feature changes

/* ---------------- buildLadder ----------------
   Build ONE symmetric slow–fast–slow path.

     buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 5 })  ->  [60, 65, 70, 65, 60]

   Rules enforced here (see the product spec):
     - The starting tempo appears at both ends.
     - The peak is played exactly once, at the apex.
     - The descent retraces the ascent (the actual rungs visited).
     - If the step does not land on the peak, the exact peak is still included
       and the return is symmetric over the rungs actually visited:
         buildLadder({ startBpm: 60, peakBpm: 72, stepBpm: 5 }) -> [60,65,70,72,70,65,60]
   There is intentionally no ascending-only or descending-only option. */
function buildLadder(opts) {
  opts = opts || {};
  var start = opts.startBpm, peak = opts.peakBpm, step = opts.stepBpm;

  if (!isPos(start)) throw new Error("startBpm must be a positive number");
  if (!isPos(peak))  throw new Error("peakBpm must be a positive number");
  if (!isPos(step))  throw new Error("stepBpm must be a positive number");

  // Degenerate but valid: peak at or below start is a single-rung "ladder".
  if (peak <= start) return [start];

  // Ascend by whole steps while a full step stays strictly below the peak,
  // then cap with the exact peak so it is hit once even off the step grid.
  var ascent = [start];
  var v = start;
  while (v + step < peak) {
    v += step;
    ascent.push(v);
  }
  ascent.push(peak); // exact peak, exactly once

  // Descent retraces the ascent minus the peak itself.
  var ladder = ascent.slice();
  for (var i = ascent.length - 2; i >= 0; i--) ladder.push(ascent[i]);
  return ladder;
}

function isPos(n) { return typeof n === "number" && isFinite(n) && n > 0; }

/* ---------------- buildStages ----------------
   Resolve a rung array + options into the concrete measure-by-measure plan the
   position machine walks. Each stage:

     { kind, bpm, measures, rungIndex, direction }

   kind:
     "count-in"   one click-only measure at the STARTING tempo, before rung 0.
     "play"       the student plays `measuresPerTempo` measures at bpm.
     "transition" Step Mode only: exactly one click-only measure BEFORE a new
                  rung, clicking at the UPCOMING tempo (both a physical reset
                  and the count-in for the new rung).

   Nonstop Mode has no transition stages — the tempo changes directly on the
   next measure boundary; the final measure of a stage carries a visual warning
   (derived, not a separate stage). */
function buildStages(rungs, measuresPerTempo, mode) {
  var peakIndex = indexOfPeak(rungs);
  var stages = [];

  // Initial count-in: one measure at the starting tempo, ahead of rung 0.
  stages.push({ kind: "count-in", bpm: rungs[0], measures: 1, rungIndex: 0,
                direction: directionAt(0, peakIndex) });

  for (var i = 0; i < rungs.length; i++) {
    var dir = directionAt(i, peakIndex);
    if (mode === "step" && i > 0) {
      // Transition clicks at the tempo ABOUT TO BE PLAYED, not the previous one.
      stages.push({ kind: "transition", bpm: rungs[i], measures: 1, rungIndex: i, direction: dir });
    }
    stages.push({ kind: "play", bpm: rungs[i], measures: measuresPerTempo, rungIndex: i, direction: dir });
  }
  return stages;
}

function indexOfPeak(rungs) {
  var peak = rungs[0], idx = 0;
  for (var i = 1; i < rungs.length; i++) if (rungs[i] > peak) { peak = rungs[i]; idx = i; }
  return idx;
}

function directionAt(rungIndex, peakIndex) {
  if (rungIndex < peakIndex) return "climbing";
  if (rungIndex > peakIndex) return "descending";
  return "peak";
}

/* ---------------- createLadderPlayback — the position machine ----------------
   Tracks the current stage and the measure within it. Advances ONLY at measure
   boundaries via advanceMeasure(). Pure state: the audio scheduler drives it
   ahead of real time; the UI reads snapshots carried on timestamped visual
   events. snapshot()/restore() give pause & resume an exact position to hold. */
var MODES = { step: true, nonstop: true };
var MEASURES_CHOICES = [4, 8, 16];

function createLadderPlayback(rungs, opts) {
  opts = opts || {};
  if (!Array.isArray(rungs) || rungs.length === 0) throw new Error("createLadderPlayback needs a rung array");

  var mode = opts.mode || "step";
  if (!MODES[mode]) throw new Error('mode must be "step" or "nonstop"');
  var measuresPerTempo = opts.measuresPerTempo === undefined ? 8 : opts.measuresPerTempo;
  if (MEASURES_CHOICES.indexOf(measuresPerTempo) === -1)
    throw new Error("measuresPerTempo must be 4, 8, or 16");

  var stages = buildStages(rungs, measuresPerTempo, mode);
  var peakIndex = indexOfPeak(rungs);
  var peakBpm = rungs[peakIndex];

  var pb = {
    rungs: rungs,
    stages: stages,
    mode: mode,
    measuresPerTempo: measuresPerTempo,
    totalRungs: rungs.length,
    peakBpm: peakBpm,
    peakIndex: peakIndex,

    stageIndex: 0,
    measureInStage: 0, // 0-based
    done: false,

    currentStage: function () { return pb.stages[pb.stageIndex]; },

    // The next stage, or null at the end of the ladder.
    nextStage: function () {
      return pb.stageIndex + 1 < pb.stages.length ? pb.stages[pb.stageIndex + 1] : null;
    },

    // BPM of the next stage the student PLAYS (skips the click-only stage that
    // may sit between here and it). null once no played rung remains.
    nextPlayedBpm: function () {
      for (var i = pb.stageIndex + 1; i < pb.stages.length; i++)
        if (pb.stages[i].kind === "play") return pb.stages[i].bpm;
      return null;
    },

    currentBpm: function () { return pb.currentStage().bpm; },
    direction: function () { return pb.currentStage().direction; },

    // 1-based rung number for display (both click-only and played stages carry
    // the rung they belong to).
    currentRungNumber: function () { return pb.currentStage().rungIndex + 1; },

    measuresLeftInStage: function () { return pb.currentStage().measures - pb.measureInStage; },

    // Last measure of the current stage — used for the Nonstop tempo-change warning.
    isFinalMeasureOfStage: function () {
      return pb.measureInStage === pb.currentStage().measures - 1;
    },

    // True while sitting in a click-only measure (Step Mode "Listen" state or count-in).
    isListening: function () {
      var k = pb.currentStage().kind;
      return k === "transition" || k === "count-in";
    },

    totalMeasures: function () {
      return pb.stages.reduce(function (a, s) { return a + s.measures; }, 0);
    },

    /* Move exactly one measure forward. Returns:
         "advanced" — same stage
         "stage"    — entered a new stage
         "done"     — the ladder finished                                    */
    advanceMeasure: function () {
      if (pb.done) return "done";
      pb.measureInStage++;
      if (pb.measureInStage < pb.currentStage().measures) return "advanced";
      pb.measureInStage = 0;
      pb.stageIndex++;
      if (pb.stageIndex < pb.stages.length) return "stage";
      pb.done = true;
      pb.stageIndex = pb.stages.length - 1;
      pb.measureInStage = pb.currentStage().measures; // park at the end
      return "done";
    },

    // Exact position, for pause/resume. done captured too so a paused-at-end
    // session restores as finished.
    snapshot: function () {
      return { stageIndex: pb.stageIndex, measureInStage: pb.measureInStage, done: pb.done };
    },
    restore: function (s) {
      pb.stageIndex = s.stageIndex;
      pb.measureInStage = s.measureInStage;
      pb.done = s.done;
    },

    reset: function () {
      pb.stageIndex = 0;
      pb.measureInStage = 0;
      pb.done = false;
    },
  };
  return pb;
}

/* ---------------- timing helpers (pure) ----------------
   Closed-form durations used by the scheduler to accumulate EXACT beat times
   (no drift) and by the tests to assert the total ladder length. */
function beatSeconds(bpm) { return 60 / bpm; }
function measureSeconds(bpm) { return BEATS_PER_MEASURE * beatSeconds(bpm); }

// Total wall-clock seconds of a built playback (count-in + every measure).
function totalSeconds(pb) {
  return pb.stages.reduce(function (a, s) {
    return a + s.measures * measureSeconds(s.bpm);
  }, 0);
}

var TempoLadderCore = {
  BEATS_PER_MEASURE: BEATS_PER_MEASURE,
  MEASURES_CHOICES: MEASURES_CHOICES,
  buildLadder: buildLadder,
  buildStages: buildStages,
  createLadderPlayback: createLadderPlayback,
  beatSeconds: beatSeconds,
  measureSeconds: measureSeconds,
  totalSeconds: totalSeconds,
};

if (typeof module !== "undefined" && module.exports) module.exports = TempoLadderCore;
else root.TempoLadderCore = TempoLadderCore;

})(typeof self !== "undefined" ? self : this);
