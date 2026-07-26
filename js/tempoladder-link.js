/* Tempo Ladder — settings resolution + shareable link.
   Pure data + logic: validating a settings-shaped object, reading one out of a
   query string, and building the query a Copy link hands over. No DOM, no Web
   Audio — the browser page and the Node tests both load this file.

   Settings precedence, applied by the page at boot:
     built-in defaults  <  last-used (localStorage)  <  a shared link

   Fallback is per field, not per link: an unreadable value leaves that setting
   at whatever the previous layer resolved, while the readable settings around
   it still apply. A hand-edited or truncated link therefore opens a usable
   setup screen instead of an error.

   Classic script (works over file://); exports for Node at the bottom.
   Layering (mirrors the core): this is layer 0 — it decides what the ladder
   should be before buildLadder() decides what it is.                          */
(function (root) {
"use strict";

var LIMITS = {
  startBpm: { lo: 30, hi: 300 },
  peakBpm: { lo: 30, hi: 300 },
  stepBpm: { lo: 1, hi: 30 },
};

var MEASURES_CHOICES = [4, 8, 16];
var MODES = ["step", "nonstop"];

/* The label is the one free-text setting: what the student is actually playing
   while Tempo Ladder runs the tempo — "Line 4", "Single-stroke roll", "Bach
   excerpt, m. 12". Tempo Ladder still supplies no musical content; this is a
   caption for material that lives outside the app. */
var MAX_LABEL_LENGTH = 80;

// Control characters only. Dashes, accents, and punctuation all survive.
var CONTROL_CHARACTERS = new RegExp("[\u0000-\u001F\u007F]", "g");

// Query parameter names. Existing links carry the first five; anything absent
// simply leaves that setting alone, so links shared before a field existed keep
// working unchanged.
var PARAMS = {
  startBpm: "start",
  peakBpm: "peak",
  stepBpm: "step",
  measuresPerTempo: "measures",
  mode: "mode",
  label: "label",
};

var URLSearchParamsRef = typeof URLSearchParams !== "undefined" ? URLSearchParams : null;

// Clamp to an integer range; null for missing/garbage so callers leave the
// existing setting untouched.
function toInt(v, lo, hi) {
  if (v === null || v === undefined || v === "") return null;
  var n = Math.round(+v);
  if (!isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}

/* Trim, collapse whitespace, drop control characters, and cap the length.
   Returns "" for anything unusable, which callers treat as "no label". The
   result is only ever written to the page as text, never as markup. */
function normalizeLabel(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(CONTROL_CHARACTERS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_LENGTH);
}

/* Fold a raw settings-shaped object over a resolved one, validating each field.
   Returns a new object; the input is never mutated. */
function applySettings(current, raw) {
  var next = {};
  var key;
  for (key in current) {
    if (Object.prototype.hasOwnProperty.call(current, key)) next[key] = current[key];
  }
  if (!raw || typeof raw !== "object") return next;

  var n;
  if ((n = toInt(raw.startBpm, LIMITS.startBpm.lo, LIMITS.startBpm.hi)) !== null) next.startBpm = n;
  if ((n = toInt(raw.peakBpm, LIMITS.peakBpm.lo, LIMITS.peakBpm.hi)) !== null) next.peakBpm = n;
  if ((n = toInt(raw.stepBpm, LIMITS.stepBpm.lo, LIMITS.stepBpm.hi)) !== null) next.stepBpm = n;
  if (MEASURES_CHOICES.indexOf(+raw.measuresPerTempo) !== -1) next.measuresPerTempo = +raw.measuresPerTempo;
  if (MODES.indexOf(raw.mode) !== -1) next.mode = raw.mode;

  // An explicitly empty label clears one carried over from a previous layer;
  // an absent label leaves it alone.
  if (raw.label !== null && raw.label !== undefined) next.label = normalizeLabel(raw.label);

  return next;
}

/* Read a query string into a raw settings-shaped object. Accepts "?a=b", "a=b",
   or a URLSearchParams. Absent parameters come back undefined so applySettings
   leaves those settings at the previous layer. */
function queryToRaw(search) {
  if (!URLSearchParamsRef) return {};

  var q;
  try {
    q = search instanceof URLSearchParamsRef ? search : new URLSearchParamsRef(search || "");
  } catch (e) {
    return {};
  }

  var raw = {};
  for (var key in PARAMS) {
    if (!Object.prototype.hasOwnProperty.call(PARAMS, key)) continue;
    if (q.has(PARAMS[key])) raw[key] = q.get(PARAMS[key]);
  }
  return raw;
}

function defaults() {
  return { startBpm: 60, peakBpm: 100, stepBpm: 5, measuresPerTempo: 8, mode: "step", label: "" };
}

/* Build the query a shared link carries. The five ladder settings are always
   written so the link means one exact climb; the label only appears when there
   is one, keeping a plain ladder link as short as it has always been. */
function buildShareQuery(settings) {
  var s = applySettings(defaults(), settings || {});
  var parts = [
    PARAMS.startBpm + "=" + encodeURIComponent(s.startBpm),
    PARAMS.peakBpm + "=" + encodeURIComponent(s.peakBpm),
    PARAMS.stepBpm + "=" + encodeURIComponent(s.stepBpm),
    PARAMS.measuresPerTempo + "=" + encodeURIComponent(s.measuresPerTempo),
    PARAMS.mode + "=" + encodeURIComponent(s.mode),
  ];
  if (s.label) parts.push(PARAMS.label + "=" + encodeURIComponent(s.label));
  return parts.join("&");
}

var TempoLadderLink = {
  LIMITS: LIMITS,
  MEASURES_CHOICES: MEASURES_CHOICES,
  MODES: MODES,
  MAX_LABEL_LENGTH: MAX_LABEL_LENGTH,
  PARAMS: PARAMS,
  defaults: defaults,
  normalizeLabel: normalizeLabel,
  applySettings: applySettings,
  queryToRaw: queryToRaw,
  buildShareQuery: buildShareQuery,
};

if (typeof module !== "undefined" && module.exports) module.exports = TempoLadderLink;
else root.TempoLadderLink = TempoLadderLink;

})(typeof self !== "undefined" ? self : this);
