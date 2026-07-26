/* Tempo Ladder link/settings test cases — runner-agnostic, same shape as
   cases.js. Each case is { name, fn(assert, link) } where assert provides
   ok / equal / deepEqual. Run them either way:
     - Node:    node --test tests/        (wraps these in node:test)
     - Browser: open tests/test.html      (no tooling needed)

   These cover what a hand-edited or truncated URL can do to the setup screen:
   the resolution order defaults < saved < link, per-field fallback, clamping,
   and the label a shared ladder can carry. */
(function (root) {
"use strict";

function getLinkCases(link) {
  var defaults = link.defaults;
  var applySettings = link.applySettings;
  var queryToRaw = link.queryToRaw;
  var buildShareQuery = link.buildShareQuery;
  var normalizeLabel = link.normalizeLabel;

  // Resolve a query string exactly the way boot does, over optional saved values.
  function resolve(query, saved) {
    return applySettings(applySettings(defaults(), saved || null), queryToRaw(query));
  }

  var CONTROL = String.fromCharCode(0, 9, 10, 27, 31, 127);

  return [

    { name: "defaults are the documented five settings plus an empty label", fn: function (assert) {
      assert.deepEqual(defaults(), {
        startBpm: 60, peakBpm: 100, stepBpm: 5, measuresPerTempo: 8, mode: "step", label: "",
      });
    } },

    { name: "a full link round-trips through the share query", fn: function (assert) {
      var settings = {
        startBpm: 72, peakBpm: 144, stepBpm: 6, measuresPerTempo: 16, mode: "nonstop",
        label: "Line 4 - m. 12",
      };
      assert.deepEqual(resolve(buildShareQuery(settings)), settings);
    } },

    { name: "every valid settings combination survives the round trip", fn: function (assert) {
      var starts = [30, 60, 61, 120, 299, 300];
      var peaks = [30, 100, 137, 300];
      var steps = [1, 5, 7, 30];
      var measures = link.MEASURES_CHOICES;
      var modes = link.MODES;
      var labels = ["", "Line 4", "Bach excerpt, m. 12"];
      var checked = 0;

      for (var a = 0; a < starts.length; a++)
        for (var b = 0; b < peaks.length; b++)
          for (var c = 0; c < steps.length; c++)
            for (var d = 0; d < measures.length; d++)
              for (var e = 0; e < modes.length; e++)
                for (var f = 0; f < labels.length; f++) {
                  var settings = {
                    startBpm: starts[a], peakBpm: peaks[b], stepBpm: steps[c],
                    measuresPerTempo: measures[d], mode: modes[e], label: labels[f],
                  };
                  assert.deepEqual(resolve(buildShareQuery(settings)), settings);
                  checked++;
                }

      assert.equal(checked, starts.length * peaks.length * steps.length * measures.length * modes.length * labels.length);
    } },

    { name: "a link overrides saved settings, and saved overrides defaults", fn: function (assert) {
      var saved = { startBpm: 80, peakBpm: 160, stepBpm: 10, measuresPerTempo: 4, mode: "nonstop", label: "Saved" };
      var resolved = resolve("start=90&label=Shared", saved);
      assert.equal(resolved.startBpm, 90, "the link wins");
      assert.equal(resolved.label, "Shared", "the link wins");
      assert.equal(resolved.peakBpm, 160, "untouched fields keep the saved value");
      assert.equal(resolved.mode, "nonstop", "untouched fields keep the saved value");
      assert.equal(resolve("", saved).startBpm, 80, "no link leaves the saved value");
    } },

    { name: "fallback is per field: one bad value does not discard the rest", fn: function (assert) {
      var resolved = resolve("start=72&peak=nonsense&step=6&measures=7&mode=sideways&label=Line 4");
      assert.equal(resolved.startBpm, 72, "readable value applied");
      assert.equal(resolved.stepBpm, 6, "readable value applied");
      assert.equal(resolved.label, "Line 4", "readable value applied");
      assert.equal(resolved.peakBpm, 100, "unreadable value falls back to the previous layer");
      assert.equal(resolved.measuresPerTempo, 8, "a value outside the allowed set falls back");
      assert.equal(resolved.mode, "step", "an unknown mode falls back");
    } },

    { name: "out-of-range tempos clamp instead of failing", fn: function (assert) {
      assert.equal(resolve("start=1").startBpm, 30);
      assert.equal(resolve("start=9999").startBpm, 300);
      assert.equal(resolve("peak=0").peakBpm, 30);
      assert.equal(resolve("peak=100000").peakBpm, 300);
      assert.equal(resolve("step=0").stepBpm, 1);
      assert.equal(resolve("step=999").stepBpm, 30);
      assert.equal(resolve("start=72.6").startBpm, 73, "fractional tempos round");
    } },

    { name: "no query at all resolves to the defaults", fn: function (assert) {
      assert.deepEqual(resolve(""), defaults());
      assert.deepEqual(resolve("?"), defaults());
      assert.deepEqual(resolve("utm_source=newsletter"), defaults());
    } },

    { name: "a hostile query never throws and always resolves", fn: function (assert) {
      var hostile = [
        "", "?", "&&&", "=&=&=", "%%%", "start=%E0%A4%A", "start=72&start=90",
        "label=" + encodeURIComponent(CONTROL), "mode[]=step", "start=Infinity",
        "step=-0", "measures=8.0", new Array(400).join("a"), null, undefined,
      ];

      for (var i = 0; i < hostile.length; i++) {
        var resolved = resolve(hostile[i]);
        assert.equal(typeof resolved.startBpm, "number", "start stays a number for " + hostile[i]);
        assert.ok(resolved.startBpm >= 30 && resolved.startBpm <= 300, "start stays in range");
        assert.ok(resolved.stepBpm >= 1 && resolved.stepBpm <= 30, "step stays in range");
        assert.ok(link.MODES.indexOf(resolved.mode) !== -1, "mode stays valid");
        assert.ok(link.MEASURES_CHOICES.indexOf(resolved.measuresPerTempo) !== -1, "measures stays valid");
        assert.equal(typeof resolved.label, "string", "label stays a string");
      }
    } },

    { name: "repeated parameters take the first value", fn: function (assert) {
      assert.equal(resolve("start=72&start=90&start=nope").startBpm, 72);
    } },

    /* The label is the only free text the app accepts, and it arrives from a
       URL a stranger may have written. It is rendered as text, never markup,
       and normalization is what keeps it a caption rather than a payload. */
    { name: "a label is trimmed, collapsed, and capped", fn: function (assert) {
      assert.equal(normalizeLabel("   Line   4   "), "Line 4");
      assert.equal(normalizeLabel(""), "");
      assert.equal(normalizeLabel("   "), "");
      assert.equal(normalizeLabel(null), "");
      assert.equal(normalizeLabel(undefined), "");
      assert.equal(normalizeLabel(new Array(200).join("x")).length, link.MAX_LABEL_LENGTH);
    } },

    { name: "a label keeps the punctuation a musician would type", fn: function (assert) {
      assert.equal(normalizeLabel("single-stroke roll"), "single-stroke roll");
      assert.equal(normalizeLabel("Bach, BWV 1007 (m. 12-16)"), "Bach, BWV 1007 (m. 12-16)");
      assert.equal(normalizeLabel("6/8 feel @ 132"), "6/8 feel @ 132");
    } },

    { name: "control characters are stripped from a label", fn: function (assert) {
      assert.equal(normalizeLabel("Line" + CONTROL + "4"), "Line 4");
      var resolved = resolve("label=" + encodeURIComponent("A" + CONTROL + "B"));
      assert.equal(resolved.label, "A B");
    } },

    { name: "markup in a label stays inert text", fn: function (assert) {
      var raw = '<img src=x onerror="boom()">';
      assert.equal(normalizeLabel(raw), raw, "normalization does not mangle it");
      assert.equal(resolve("label=" + encodeURIComponent(raw)).label, raw);
      // Proof of safety is that the page assigns it with textContent; this case
      // pins the contract that the module hands back plain text unchanged.
    } },

    { name: "an empty label parameter clears a saved one", fn: function (assert) {
      var saved = { startBpm: 60, peakBpm: 100, stepBpm: 5, measuresPerTempo: 8, mode: "step", label: "Saved" };
      assert.equal(resolve("label=", saved).label, "", "an explicit empty label clears it");
      assert.equal(resolve("start=72", saved).label, "Saved", "an absent label leaves it alone");
    } },

    /* Links shared before the label existed carry only the original five
       parameters. They must keep resolving exactly as they always did. */
    { name: "a link written before labels existed still works", fn: function (assert) {
      var legacy = "start=60&peak=100&step=5&measures=8&mode=step";
      assert.deepEqual(resolve(legacy), defaults());

      var legacyOther = "start=80&peak=160&step=10&measures=16&mode=nonstop";
      assert.deepEqual(resolve(legacyOther), {
        startBpm: 80, peakBpm: 160, stepBpm: 10, measuresPerTempo: 16, mode: "nonstop", label: "",
      });
    } },

    { name: "the share query omits the label when there is none", fn: function (assert) {
      var query = buildShareQuery(defaults());
      assert.equal(query.indexOf("label") === -1, true, "no empty label parameter");
      assert.equal(query, "start=60&peak=100&step=5&measures=8&mode=step");
    } },

    { name: "the share query encodes a label safely", fn: function (assert) {
      var query = buildShareQuery({ label: "Line 4 & 5 = fun?" });
      assert.equal(query.indexOf("label=Line%204%20%26%205%20%3D%20fun%3F") !== -1, true, query);
      assert.equal(resolve(query).label, "Line 4 & 5 = fun?", "and decodes back");
    } },

    { name: "building a share query repairs an out-of-range settings object", fn: function (assert) {
      var query = buildShareQuery({ startBpm: 5, peakBpm: 9999, stepBpm: 0, measuresPerTempo: 7, mode: "sideways" });
      var resolved = resolve(query);
      assert.equal(resolved.startBpm, 30);
      assert.equal(resolved.peakBpm, 300);
      assert.equal(resolved.stepBpm, 1);
      assert.equal(resolved.measuresPerTempo, 8, "an invalid choice falls back to the default");
      assert.equal(resolved.mode, "step");
    } },

    { name: "applySettings never mutates its input", fn: function (assert) {
      var current = defaults();
      var frozen = JSON.stringify(current);
      applySettings(current, { startBpm: 90, label: "Line 4" });
      assert.equal(JSON.stringify(current), frozen);
    } },

  ];
}

var api = { getLinkCases: getLinkCases };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.TempoLadderLinkTests = api;

})(typeof self !== "undefined" ? self : this);
