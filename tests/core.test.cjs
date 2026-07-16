/* Node wrapper for the shared test cases — run with:  node --test tests/
   (No Node? Open tests/test.html in a browser instead — same cases.) */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../js/tempoladder-core.js");
const { getCases } = require("./cases.js");

for (const c of getCases(core)) {
  test(c.name, () => c.fn(assert, core));
}
