/* Tempo Ladder core test cases — runner-agnostic.
   Each case is { name, fn(assert, core) } where assert provides
   ok / equal / deepEqual. Run them either way:
     - Node:    node --test tests/        (wraps these in node:test)
     - Browser: open tests/test.html      (no tooling needed)

   Covers the product spec's required checks. Items that live in the audio /
   scheduler harness rather than the pure core (rapid-Start guard, tab
   visibility, keyboard/touch) are exercised in index.html and verified in the
   browser; the notes below say where each is proven. */
(function (root) {
"use strict";

function getCases(core) {
  var buildLadder = core.buildLadder;
  var buildStages = core.buildStages;
  var createLadderPlayback = core.createLadderPlayback;
  var BEATS = core.BEATS_PER_MEASURE;

  // Walk a playback to completion, recording a snapshot per measure.
  function walkMeasures(pb, cap) {
    var rows = [];
    var guard = cap || 10000;
    while (!pb.done && guard-- > 0) {
      var s = pb.currentStage();
      rows.push({
        kind: s.kind, bpm: pb.currentBpm(), rung: pb.currentRungNumber(),
        dir: pb.direction(), measureInStage: pb.measureInStage,
        nextPlayed: pb.nextPlayedBpm(), finalMeasure: pb.isFinalMeasureOfStage(),
        listening: pb.isListening(),
      });
      pb.advanceMeasure();
    }
    return rows;
  }

  // Per-beat BPM timeline: one entry per beat across the whole ladder.
  function beatBpmTimeline(pb) {
    var out = [];
    for (var i = 0; i < pb.stages.length; i++) {
      var st = pb.stages[i];
      for (var m = 0; m < st.measures; m++)
        for (var b = 0; b < BEATS; b++) out.push(st.bpm);
    }
    return out;
  }

  return [

  /* 1 — 60–70 with a 5 BPM step produces 60,65,70,65,60. */
  { name: "buildLadder(60,70,5) = [60,65,70,65,60]", fn: function (assert) {
    assert.deepEqual(buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 5 }),
                     [60, 65, 70, 65, 60]);
  }},

  /* extra — the spec's headline example, longer climb. */
  { name: "buildLadder(60,100,5) climbs and descends by 5", fn: function (assert) {
    assert.deepEqual(buildLadder({ startBpm: 60, peakBpm: 100, stepBpm: 5 }),
      [60,65,70,75,80,85,90,95,100,95,90,85,80,75,70,65,60]);
  }},

  /* 2 — a peak not divisible by the step is still included exactly. */
  { name: "peak off the step grid is still hit exactly once", fn: function (assert) {
    var l = buildLadder({ startBpm: 60, peakBpm: 72, stepBpm: 5 });
    assert.deepEqual(l, [60, 65, 70, 72, 70, 65, 60]);
    assert.equal(l.filter(function (x) { return x === 72; }).length, 1, "peak once");
  }},

  /* extra — a step larger than the whole gap still yields a valid symmetric ladder. */
  { name: "step wider than the gap yields [start, peak, start]", fn: function (assert) {
    assert.deepEqual(buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 15 }), [60, 70, 60]);
  }},

  /* 3 — the peak appears exactly once (checked across several ladders). */
  { name: "peak appears exactly once", fn: function (assert) {
    [[60,70,5],[60,100,5],[72,101,7],[50,63,4]].forEach(function (t) {
      var l = buildLadder({ startBpm: t[0], peakBpm: t[1], stepBpm: t[2] });
      var peak = Math.max.apply(null, l);
      assert.equal(l.filter(function (x) { return x === peak; }).length, 1,
        "one peak in " + JSON.stringify(l));
    });
  }},

  /* 4 — the starting tempo appears at both ends, and the ladder is symmetric. */
  { name: "start tempo bookends a symmetric ladder", fn: function (assert) {
    [[60,70,5],[60,100,5],[72,101,7],[80,95,6]].forEach(function (t) {
      var l = buildLadder({ startBpm: t[0], peakBpm: t[1], stepBpm: t[2] });
      assert.equal(l[0], t[0], "starts at start");
      assert.equal(l[l.length - 1], t[0], "ends at start");
      for (var i = 0; i < l.length; i++)
        assert.equal(l[i], l[l.length - 1 - i], "symmetric at " + i);
    });
  }},

  /* input guards */
  { name: "buildLadder rejects non-positive inputs", fn: function (assert) {
    assert.ok(threw(function () { buildLadder({ startBpm: 0, peakBpm: 70, stepBpm: 5 }); }), "zero start");
    assert.ok(threw(function () { buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 0 }); }), "zero step");
    assert.ok(threw(function () { buildLadder({ startBpm: 60, peakBpm: -1, stepBpm: 5 }); }), "neg peak");
  }},

  { name: "peak <= start collapses to a single rung", fn: function (assert) {
    assert.deepEqual(buildLadder({ startBpm: 80, peakBpm: 80, stepBpm: 5 }), [80]);
    assert.deepEqual(buildLadder({ startBpm: 80, peakBpm: 70, stepBpm: 5 }), [80]);
  }},

  /* 5 — Step Mode inserts exactly one transition measure between rungs. */
  { name: "Step Mode: one transition measure before each rung after the first", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 5 }); // 5 rungs
    var stages = buildStages(rungs, 8, "step");
    var trans = stages.filter(function (s) { return s.kind === "transition"; });
    assert.equal(trans.length, rungs.length - 1, "one transition per rung after the first");
    // Exactly one measure each, and each play stage (after rung 0) is immediately
    // preceded by exactly one transition.
    for (var i = 0; i < trans.length; i++) assert.equal(trans[i].measures, 1, "transition is one measure");
    stages.forEach(function (s, i) {
      if (s.kind === "play" && s.rungIndex > 0)
        assert.equal(stages[i - 1].kind, "transition", "play rung " + s.rungIndex + " preceded by transition");
    });
  }},

  /* 6 — every Step Mode transition uses the UPCOMING BPM, not the previous one. */
  { name: "Step Mode: transitions click at the upcoming tempo", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 75, stepBpm: 5 });
    var stages = buildStages(rungs, 4, "step");
    stages.forEach(function (s, i) {
      if (s.kind === "transition") {
        var nextPlay = stages[i + 1];
        assert.equal(nextPlay.kind, "play", "transition followed by its play stage");
        assert.equal(s.bpm, nextPlay.bpm, "transition bpm == upcoming rung bpm");
        assert.equal(s.bpm, rungs[s.rungIndex], "transition bpm == rungs[rungIndex]");
      }
    });
  }},

  /* 7 — Nonstop Mode inserts no transition measure. */
  { name: "Nonstop Mode: no transition stages", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 80, stepBpm: 5 });
    var stages = buildStages(rungs, 8, "nonstop");
    assert.equal(stages.filter(function (s) { return s.kind === "transition"; }).length, 0, "no transitions");
    // Exactly one count-in + one play stage per rung.
    assert.equal(stages.filter(function (s) { return s.kind === "count-in"; }).length, 1, "one count-in");
    assert.equal(stages.filter(function (s) { return s.kind === "play"; }).length, rungs.length, "one play per rung");
  }},

  /* count-in — one measure at the starting tempo, both modes. */
  { name: "one-measure count-in at the starting tempo (both modes)", fn: function (assert) {
    ["step", "nonstop"].forEach(function (mode) {
      var rungs = buildLadder({ startBpm: 66, peakBpm: 78, stepBpm: 6 });
      var stages = buildStages(rungs, 8, mode);
      assert.equal(stages[0].kind, "count-in", mode + ": first stage is count-in");
      assert.equal(stages[0].measures, 1, mode + ": count-in is one measure");
      assert.equal(stages[0].bpm, rungs[0], mode + ": count-in at starting tempo");
    });
  }},

  /* 8 — tempo changes occur only at measure boundaries. */
  { name: "BPM changes only at measure boundaries", fn: function (assert) {
    ["step", "nonstop"].forEach(function (mode) {
      var rungs = buildLadder({ startBpm: 60, peakBpm: 72, stepBpm: 5 });
      var pb = createLadderPlayback(rungs, { measuresPerTempo: 4, mode: mode });
      var beats = beatBpmTimeline(pb);
      for (var i = 1; i < beats.length; i++) {
        if (beats[i] !== beats[i - 1])
          assert.equal(i % BEATS, 0, mode + ": tempo change at beat " + i + " lands on a measure boundary");
      }
    });
  }},

  /* 9 — pause/resume preserves the exact playback position (snapshot round-trip). */
  { name: "snapshot/restore preserves the exact position", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 80, stepBpm: 5 });
    var pb = createLadderPlayback(rungs, { measuresPerTempo: 8, mode: "step" });
    for (var i = 0; i < 17; i++) pb.advanceMeasure(); // wander into the ladder
    var before = { stageIndex: pb.stageIndex, measureInStage: pb.measureInStage,
                   bpm: pb.currentBpm(), rung: pb.currentRungNumber(), dir: pb.direction(),
                   next: pb.nextPlayedBpm(), listening: pb.isListening() };
    var snap = pb.snapshot();
    // Simulate a stop/rebuild + restore (what pause→resume relies on).
    var pb2 = createLadderPlayback(rungs, { measuresPerTempo: 8, mode: "step" });
    pb2.restore(snap);
    assert.equal(pb2.stageIndex, before.stageIndex, "stageIndex");
    assert.equal(pb2.measureInStage, before.measureInStage, "measureInStage");
    assert.equal(pb2.currentBpm(), before.bpm, "bpm");
    assert.equal(pb2.currentRungNumber(), before.rung, "rung");
    assert.equal(pb2.direction(), before.dir, "direction");
    assert.equal(pb2.nextPlayedBpm(), before.next, "next played bpm");
    assert.equal(pb2.isListening(), before.listening, "listening state");
  }},

  /* 10 — reset returns the machine to the very start. */
  { name: "reset clears position back to the top of the ladder", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 90, stepBpm: 10 });
    var pb = createLadderPlayback(rungs, { measuresPerTempo: 4, mode: "nonstop" });
    while (!pb.done) pb.advanceMeasure();
    assert.ok(pb.done, "ran to completion");
    pb.reset();
    assert.equal(pb.stageIndex, 0, "stageIndex 0");
    assert.equal(pb.measureInStage, 0, "measureInStage 0");
    assert.equal(pb.done, false, "not done");
    assert.equal(pb.currentStage().kind, "count-in", "back at count-in");
  }},

  /* 11 — current BPM, next BPM, direction, rung, measure stay synchronized. */
  { name: "snapshots stay internally coherent across the whole ladder", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 80, stepBpm: 5 }); // [60..80..60]
    var pb = createLadderPlayback(rungs, { measuresPerTempo: 4, mode: "step" });
    var rows = walkMeasures(pb);
    var peak = Math.max.apply(null, rungs);

    // The reported BPM always matches the BPM of the reported rung, and the
    // peak BPM is always labelled "peak".
    rows.forEach(function (r) {
      assert.equal(r.bpm, rungs[r.rung - 1], "bpm matches rung " + r.rung);
      if (r.bpm === peak) assert.equal(r.dir, "peak", "peak labelled at " + r.bpm);
      assert.ok(r.measureInStage >= 0, "measure >= 0");
    });

    // Direction is one contiguous run: climbing* then a peak block then
    // descending*. (Step Mode's peak rung spans a transition measure plus its
    // played measures, so the peak block has length > 1 — it must be contiguous.)
    var seq = rows.map(function (r) { return r.dir; });
    var firstPeak = seq.indexOf("peak");
    var lastPeak = seq.lastIndexOf("peak");
    assert.ok(firstPeak > 0, "peak reached");
    for (var k = firstPeak; k <= lastPeak; k++) assert.equal(seq[k], "peak", "contiguous peak at " + k);
    assert.ok(seq.slice(0, firstPeak).every(function (d) { return d === "climbing"; }), "all climbing before peak");
    assert.ok(seq.slice(lastPeak + 1).every(function (d) { return d === "descending"; }), "all descending after peak");
  }},

  /* nextPlayedBpm points at the actual next rung the student plays. */
  { name: "nextPlayedBpm tracks the upcoming played rung", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 5 }); // [60,65,70,65,60]
    var pb = createLadderPlayback(rungs, { measuresPerTempo: 4, mode: "step" });
    // The initial count-in counts the student INTO the start tempo (60) — that
    // is the next rung actually played.
    assert.equal(pb.nextPlayedBpm(), 60, "count-in counts into 60");
    pb.advanceMeasure(); // into play(60)
    assert.equal(pb.currentBpm(), 60, "playing the first rung at 60");
    assert.equal(pb.nextPlayedBpm(), 65, "next played rung is 65");
    // Advance to the last rung: next played bpm should be null.
    var guard = 1000;
    while (pb.nextPlayedBpm() !== null && guard-- > 0) pb.advanceMeasure();
    assert.equal(pb.currentBpm(), 60, "landed on final rung");
    assert.equal(pb.direction(), "descending", "final rung is on the descent");
  }},

  /* Nonstop final-measure warning: the last measure of a stage that precedes a
     tempo change is flagged, and only then. */
  { name: "Nonstop: final measure before a tempo change is flagged", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 5 }); // 5 rungs
    var pb = createLadderPlayback(rungs, { measuresPerTempo: 4, mode: "nonstop" });
    var warnings = 0, changes = 0, prevBpm = pb.currentBpm();
    while (!pb.done) {
      var stage = pb.currentStage();
      // The final-measure flag must correspond exactly to the last measure of the stage.
      assert.equal(pb.isFinalMeasureOfStage(), pb.measureInStage === stage.measures - 1,
                   "final flag matches position in stage");
      var next = pb.nextStage();
      if (pb.isFinalMeasureOfStage() && next && next.bpm !== stage.bpm) warnings++;
      pb.advanceMeasure();
      if (!pb.done && pb.currentBpm() !== prevBpm) { changes++; prevBpm = pb.currentBpm(); }
    }
    assert.ok(warnings > 0, "at least one tempo-change warning fires");
    assert.equal(warnings, changes, "exactly one warning per real tempo change");
  }},

  /* 12 — a complete ladder does not accumulate timing drift.
     The scheduler accumulates exact per-beat fractions; the closed-form total
     must equal the summed per-beat walk to within floating-point epsilon. */
  { name: "no timing drift over a full ladder", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 100, stepBpm: 5 });
    var pb = createLadderPlayback(rungs, { measuresPerTempo: 16, mode: "step" });
    var closed = core.totalSeconds(pb);
    // Accumulate beat by beat the way the scheduler does.
    var acc = 0;
    for (var i = 0; i < pb.stages.length; i++) {
      var st = pb.stages[i];
      for (var m = 0; m < st.measures; m++)
        for (var b = 0; b < BEATS; b++) acc += core.beatSeconds(st.bpm);
    }
    assert.ok(Math.abs(acc - closed) < 1e-6, "drift " + Math.abs(acc - closed) + "s over " + closed.toFixed(1) + "s");
  }},

  /* options validation for the playback machine. */
  { name: "createLadderPlayback validates mode and measures", fn: function (assert) {
    var rungs = buildLadder({ startBpm: 60, peakBpm: 70, stepBpm: 5 });
    assert.ok(threw(function () { createLadderPlayback(rungs, { mode: "loop" }); }), "bad mode");
    assert.ok(threw(function () { createLadderPlayback(rungs, { measuresPerTempo: 5 }); }), "bad measures");
    assert.ok(threw(function () { createLadderPlayback([], {}); }), "empty rungs");
    [4, 8, 16].forEach(function (mm) {
      assert.ok(createLadderPlayback(rungs, { measuresPerTempo: mm, mode: "step" }), "measures " + mm + " ok");
    });
  }},

  /* Harness-level checks (proven in the browser, noted here for the record):
       13 rapid Start presses cannot stack schedulers — index.html startSession()
          is idempotent (clears the interval + orphans scheduled sources first).
       14 tab / visibility changes do not corrupt — the visual queue is flushed
          from BOTH rAF and the scheduler tick, and the AudioContext clock is the
          source of truth, so a throttled tab only delays the display, never the
          audio timeline.
       15 keyboard and touch controls — all transport controls are <button>s with
          visible focus and key handlers; verified in the preview. */

  ];

  function threw(fn) { try { fn(); return false; } catch (e) { return true; } }
}

var api = { getCases: getCases };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.TempoLadderTests = api;

})(typeof self !== "undefined" ? self : this);
