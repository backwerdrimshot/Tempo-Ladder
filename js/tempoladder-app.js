"use strict";
/* Tempo Ladder — audio scheduler + UI on top of TempoLadderCore.
   The lookahead scheduler and click voice are adapted from Click Drop /
   Pulse Pocket. Layer boundaries kept intact:
     Core       — buildLadder + createLadderPlayback (pure, no DOM/audio)
     scheduler  — schedules clicks on the AudioContext timeline (source of truth)
     visual Q   — timestamped events flushed at hear-time
     DOM render — renderNow() only                                            */
var Core = window.TempoLadderCore;
var BEATS = Core.BEATS_PER_MEASURE; // 4

/* ---------------- settings ---------------- */
var DEFAULTS = { startBpm: 60, peakBpm: 100, stepBpm: 5, measuresPerTempo: 8, mode: "step" };
var settings = Object.assign({}, DEFAULTS);

var $ = function (id) { return document.getElementById(id); };

/* ---------------- audio (accent tiers from Pulse Pocket / Click Drop) ---------------- */
var audio = null, master = null;
function initAudio() {
  if (audio) return;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("no-audio");
  audio = new AC();
  master = audio.createGain();
  master.gain.value = 0.9;
  master.connect(audio.destination);
}
// Oscillator click voice. Quarter-note click, beat one accented.
function click(time, type) {
  var specs = {
    down: { f: 1568, g: 1.0,  d: 0.06 },  // beat-one accent
    beat: { f: 988,  g: 0.72, d: 0.05 },  // other quarters
  };
  var s = specs[type];
  var osc = audio.createOscillator();
  var g = audio.createGain();
  osc.frequency.value = s.f;
  osc.type = "square";
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(s.g, time + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, time + s.d);
  osc.connect(g); g.connect(master);
  osc.start(time); osc.stop(time + s.d + 0.02);
}
// Orphan anything already scheduled (used by stop/reset — a suspended context
// would otherwise replay pending clicks on the next start).
function killPending() {
  if (!master) return;
  master.disconnect();
  master = audio.createGain();
  master.gain.value = 0.9;
  master.connect(audio.destination);
}

/* ---------------- live playback state ---------------- */
var LOOKAHEAD = 25, AHEAD = 0.12;
var live = {
  status: "idle",   // idle | playing | paused
  playback: null,
  ladder: null,
  pos: { beat: 0 }, // beat within the current measure (quarter granularity)
  nextTime: 0,
  timer: null,
  raf: null,
  visualQ: [],
  doneQueued: false,
};

/* ---------------- scheduler (lookahead; AudioContext.currentTime is truth) ----------------
   Reads BPM from the CURRENT stage every beat, so a tempo change at a measure
   boundary is baked into the scheduled timeline — never a UI timer flipping a
   variable after the fact. Advancing the pure machine at the boundary is what
   changes the tempo of the next scheduled beat. */
function scheduler() {
  flushVisual();
  if (live.status !== "playing" || !live.playback) return;
  var pb = live.playback;
  while (live.nextTime < audio.currentTime + AHEAD) {
    if (pb.done) {
      if (!live.doneQueued) { live.doneQueued = true; live.visualQ.push({ t: live.nextTime, done: true }); }
      return;
    }
    var st = pb.currentStage();
    var isDown = live.pos.beat === 0;
    click(live.nextTime, isDown ? "down" : "beat");

    // Snapshot everything the display needs, stamped with the beat's hear-time.
    live.visualQ.push({
      t: live.nextTime,
      beat: live.pos.beat,
      kind: st.kind,
      bpm: st.bpm,
      direction: st.direction,
      rungNumber: pb.currentRungNumber(),
      totalRungs: pb.totalRungs,
      rungIndex: st.rungIndex,
      measureInStage: pb.measureInStage,
      stageMeasures: st.measures,
      nextPlayedBpm: pb.nextPlayedBpm(),
      finalMeasure: pb.isFinalMeasureOfStage(),
      nextStageBpm: pb.nextStage() ? pb.nextStage().bpm : null,
    });

    // Exact accumulation (no drift): add one quarter-beat at the stage's tempo.
    live.nextTime += Core.beatSeconds(st.bpm);
    live.pos.beat++;
    if (live.pos.beat >= BEATS) {
      live.pos.beat = 0;
      pb.advanceMeasure(); // tempo/stage changes ONLY here, at the measure boundary
    }
  }
}

/* ---------------- display sync (hear-time) ----------------
   Flushed from BOTH rAF (smooth when visible) and the scheduler tick (keeps the
   display honest when the tab is throttled and rAF stops firing). Idempotent. */
function flushVisual() {
  if (live.status !== "playing") return;
  var now = audio.currentTime;
  var ev = null;
  while (live.visualQ.length && live.visualQ[0].t <= now) ev = live.visualQ.shift();
  if (ev) {
    if (ev.done) { finishSession(); return; }
    renderNow(ev);
  }
}
function visualLoop() {
  if (live.status !== "playing") return;
  flushVisual();
  live.raf = requestAnimationFrame(visualLoop);
}

/* ---------------- rendering (DOM only) ---------------- */
var dirLabels = { climbing: "Climbing", peak: "At the peak", descending: "Descending" };

function renderLadderBars(rungs) {
  var lo = Math.min.apply(null, rungs), hi = Math.max.apply(null, rungs);
  var span = hi - lo || 1;
  var frag = document.createDocumentFragment();
  for (var i = 0; i < rungs.length; i++) {
    var pct = 24 + 76 * (rungs[i] - lo) / span;
    var wrap = document.createElement("div");
    wrap.className = "bar-wrap";
    wrap.dataset.rung = i;
    var bar = document.createElement("div");
    bar.className = "bar" + (rungs[i] === hi ? " peak-rung" : "");
    bar.style.height = pct + "%";
    var lbl = document.createElement("div");
    lbl.className = "bar-lbl";
    lbl.textContent = rungs[i];
    wrap.appendChild(bar); wrap.appendChild(lbl);
    frag.appendChild(wrap);
  }
  var host = $("ladder");
  host.innerHTML = "";
  host.appendChild(frag);
}

function paintLadder(currentRungIndex) {
  var wraps = $("ladder").children;
  for (var i = 0; i < wraps.length; i++) {
    var bar = wraps[i].firstChild;
    bar.classList.remove("done", "current");
    wraps[i].classList.remove("current");
    if (i < currentRungIndex) bar.classList.add("done");
    else if (i === currentRungIndex) { bar.classList.add("current"); wraps[i].classList.add("current"); }
  }
}

var beatDots = null;
function renderNow(ev) {
  // Big BPM + direction
  $("curBpm").innerHTML = ev.bpm + '<small>BPM</small>';
  var dw = $("dirWord");
  dw.textContent = dirLabels[ev.direction] || "";
  dw.className = "dir-word" + (ev.direction === "peak" ? " peak" : "");

  // Next tempo chip
  if (ev.nextPlayedBpm != null) $("nextBpm").innerHTML = ev.nextPlayedBpm + '<small> BPM</small>';
  else $("nextBpm").innerHTML = '—';

  // Beat dots
  if (!beatDots) beatDots = $("beats").children;
  for (var b = 0; b < beatDots.length; b++) beatDots[b].classList.toggle("on", b === ev.beat);

  // Banner: Listen (step transition) / count-in / nonstop warning
  var banner = $("banner");
  var cls = "banner", txt = "", show = true;
  if (ev.kind === "count-in") {
    cls += " countin"; txt = "Count-in — " + ev.bpm + " BPM";
  } else if (ev.kind === "transition") {
    cls += " listen"; txt = "Listen — next tempo: " + ev.bpm + " BPM";
  } else if (settings.mode === "nonstop" && ev.finalMeasure && ev.nextStageBpm != null && ev.nextStageBpm !== ev.bpm) {
    cls += " warn"; txt = "Tempo change next measure → " + ev.nextStageBpm + " BPM";
  } else {
    show = false;
  }
  banner.className = cls + (show ? "" : " hidden");
  banner.textContent = txt;

  // Status line
  var s;
  if (ev.kind === "count-in") {
    s = "Counting in · rung 1 of " + ev.totalRungs;
  } else if (ev.kind === "transition") {
    s = "Reset measure · into rung " + ev.rungNumber + " of " + ev.totalRungs;
  } else {
    var left = ev.stageMeasures - ev.measureInStage - 1;
    s = "Rung <strong>" + ev.rungNumber + "</strong> of " + ev.totalRungs +
        " · Measure <strong>" + (ev.measureInStage + 1) + "</strong> of " + ev.stageMeasures +
        " · " + left + " to go";
  }
  $("statusLine").innerHTML = s;

  paintLadder(ev.rungIndex);
}

/* ---------------- transport ---------------- */
function showScreen(name) {
  $("screenSetup").hidden = name !== "setup";
  $("screenSession").hidden = name !== "session";
  $("screenDone").hidden = name !== "done";
}

function startSession() {
  clearErr();
  var ladder;
  try {
    ladder = Core.buildLadder({ startBpm: settings.startBpm, peakBpm: settings.peakBpm, stepBpm: settings.stepBpm });
    if (ladder.length < 2) { setErr("Peak BPM must be higher than starting BPM."); return; }
  } catch (e) { setErr("Check the BPM values and try again."); return; }

  try { initAudio(); }
  catch (e) { setErr("This browser can't play audio here. Try Chrome, Edge, Firefox, or Safari."); return; }
  if (audio.state === "suspended") audio.resume();

  // Idempotent: tear down any running scheduler + orphan scheduled clicks so
  // rapid Start presses (or Replay) can never stack schedulers or double audio.
  if (live.timer) { clearInterval(live.timer); live.timer = null; }
  if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
  killPending();

  try {
    live.playback = Core.createLadderPlayback(ladder, { measuresPerTempo: settings.measuresPerTempo, mode: settings.mode });
  } catch (e) { setErr("Couldn't build that ladder. Adjust the settings and try again."); return; }

  live.ladder = ladder;
  live.pos = { beat: 0 };
  live.visualQ = [];
  live.doneQueued = false;
  live.nextTime = audio.currentTime + 0.12;
  live.status = "playing";

  renderLadderBars(ladder);
  primeDisplay(ladder);   // avoid flashing the previous run's frame on Replay
  showScreen("session");
  updatePauseBtn();
  live.timer = setInterval(scheduler, LOOKAHEAD);
  live.raf = requestAnimationFrame(visualLoop);
  $("btnPause").focus();
}

// Paint a neutral "ready" frame at the first rung before the first beat renders.
function primeDisplay(ladder) {
  $("curBpm").innerHTML = ladder[0] + '<small>BPM</small>';
  var dw = $("dirWord"); dw.textContent = "Get ready"; dw.className = "dir-word";
  $("nextBpm").innerHTML = ladder[0] + '<small> BPM</small>';
  $("banner").className = "banner hidden"; $("banner").textContent = "";
  $("statusLine").innerHTML = "Count-in at " + ladder[0] + " BPM…";
  if (beatDots) for (var b = 0; b < beatDots.length; b++) beatDots[b].classList.remove("on");
  paintLadder(0);
}

function pauseSession() {
  if (live.status !== "playing") return;
  audio.suspend(); // context clock freezes — scheduled clicks stay valid, no doubles
  if (live.timer) { clearInterval(live.timer); live.timer = null; }
  if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
  live.status = "paused";
  updatePauseBtn();
  $("statusLine").innerHTML = "Paused — press Resume to pick up exactly where you left off.";
}

function resumeSession() {
  if (live.status !== "paused") return;
  audio.resume();
  live.status = "playing";
  updatePauseBtn();
  live.timer = setInterval(scheduler, LOOKAHEAD);
  live.raf = requestAnimationFrame(visualLoop);
}

function stopSession() {
  if (live.timer) { clearInterval(live.timer); live.timer = null; }
  if (live.raf) { cancelAnimationFrame(live.raf); live.raf = null; }
  live.visualQ = [];
  live.doneQueued = false;
  if (audio) { killPending(); if (audio.state === "suspended") audio.resume(); }
  live.status = "idle";
  live.playback = null;
}

function resetToSetup() {
  stopSession();
  showScreen("setup");
  syncPreview();
  $("btnStart").focus();
}

function finishSession() {
  stopSession();
  var l = live.ladder || Core.buildLadder({ startBpm: settings.startBpm, peakBpm: settings.peakBpm, stepBpm: settings.stepBpm });
  var peak = Math.max.apply(null, l);
  $("doneSummary").innerHTML =
    l[0] + " → " + peak + " → " + l[0] + " BPM &nbsp;·&nbsp; " +
    l.length + " rungs &nbsp;·&nbsp; " + settings.measuresPerTempo + " measures each &nbsp;·&nbsp; " +
    (settings.mode === "step" ? "Step mode" : "Nonstop mode");
  showScreen("done");
  $("btnReplay").focus();
}

function updatePauseBtn() {
  var b = $("btnPause");
  if (live.status === "paused") { b.textContent = "Resume"; b.classList.remove("play"); b.classList.add("primary"); }
  else { b.textContent = "Pause"; b.classList.add("play"); b.classList.remove("primary"); }
}

/* ---------------- setup wiring ---------------- */
function clampField(id) {
  var el = $(id);
  var min = +el.min, max = +el.max;
  var v = Math.round(+el.value);
  if (!isFinite(v)) v = +el.defaultValue || min;
  v = Math.max(min, Math.min(max, v));
  el.value = v;
  return v;
}
function readSettings() {
  settings.startBpm = clampField("startBpm");
  settings.peakBpm = clampField("peakBpm");
  settings.stepBpm = clampField("stepBpm");
}
function setErr(m) { $("setupErr").textContent = m; }
function clearErr() { $("setupErr").textContent = ""; $("sessionErr").textContent = ""; }

function syncPreview() {
  readSettings();
  var wrap = $("preview");
  var ok = settings.peakBpm > settings.startBpm;
  $("btnStart").disabled = !ok;
  if (!ok) {
    wrap.innerHTML = '<span class="hint">Set a peak higher than the start to build the ladder.</span>';
    $("previewMeta").textContent = "";
    return;
  }
  var l = Core.buildLadder({ startBpm: settings.startBpm, peakBpm: settings.peakBpm, stepBpm: settings.stepBpm });
  var peak = Math.max.apply(null, l);
  var html = "";
  for (var i = 0; i < l.length; i++) {
    if (i) html += ' <span class="arrow">→</span> ';
    html += '<span class="rung' + (l[i] === peak ? ' peak' : '') + '">' + l[i] + '</span>';
  }
  wrap.innerHTML = html;

  // Total measures incl. count-in + step transitions.
  var pb = Core.createLadderPlayback(l, { measuresPerTempo: settings.measuresPerTempo, mode: settings.mode });
  var totalMeas = pb.totalMeasures();
  var secs = Core.totalSeconds(pb);
  var mm = Math.floor(secs / 60), ss = Math.round(secs % 60);
  $("previewMeta").textContent =
    l.length + " rungs · " + totalMeas + " measures · about " + mm + ":" + (ss < 10 ? "0" : "") + ss + " total";
}

function bumpField(id, d) {
  var el = $(id);
  el.value = (Math.round(+el.value) || 0) + d;
  clampField(id);
  syncPreview();
}

function wireSeg(segId, key, onChange) {
  $(segId).addEventListener("click", function (e) {
    var btn = e.target.closest("button"); if (!btn) return;
    var kids = this.querySelectorAll("button");
    for (var i = 0; i < kids.length; i++) kids[i].setAttribute("aria-pressed", kids[i] === btn ? "true" : "false");
    var v = btn.dataset.val;
    settings[key] = (key === "measuresPerTempo") ? +v : v;
    if (onChange) onChange(v);
    syncPreview();
  });
}

/* ---------------- events ---------------- */
document.querySelectorAll("button.step").forEach(function (b) {
  b.addEventListener("click", function () { bumpField(this.dataset.target, +this.dataset.d); });
});
["startBpm", "peakBpm", "stepBpm"].forEach(function (id) {
  $(id).addEventListener("input", syncPreview);
  $(id).addEventListener("change", syncPreview);
});
wireSeg("segMeasures", "measuresPerTempo");
wireSeg("segMode", "mode", function (v) {
  $("modeHint").textContent = v === "step"
    ? "Step adds one click-only reset measure at the new tempo between rungs."
    : "Nonstop plays through the whole ladder; the tempo shifts on the next downbeat.";
});

$("btnStart").addEventListener("click", startSession);
$("btnPause").addEventListener("click", function () { live.status === "paused" ? resumeSession() : pauseSession(); });
$("btnReset").addEventListener("click", resetToSetup);
$("btnReplay").addEventListener("click", startSession);
$("btnNew").addEventListener("click", resetToSetup);

$("btnFull").addEventListener("click", function () {
  if (document.fullscreenElement) document.exitFullscreen();
  else (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
});

// Keyboard: Space toggles play/pause during a session; R resets. (Ignored while
// typing in the BPM fields.)
document.addEventListener("keydown", function (e) {
  var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (e.code === "Space" && !typing) {
    if (!$("screenSession").hidden) { e.preventDefault(); live.status === "paused" ? resumeSession() : pauseSession(); }
    else if (!$("screenSetup").hidden && !$("btnStart").disabled) { e.preventDefault(); startSession(); }
  } else if ((e.key === "r" || e.key === "R") && !typing) {
    if (!$("screenSession").hidden || !$("screenDone").hidden) resetToSetup();
  }
});

// Returning to the tab: flush the queue so the display snaps to hear-time.
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && live.status === "playing") flushVisual();
});

syncPreview();
