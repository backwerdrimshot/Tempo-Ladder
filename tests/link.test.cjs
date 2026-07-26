/* Node wrapper for the shared link/settings cases — run with:  node --test tests/
   (No Node? Open tests/test.html in a browser instead — same cases.) */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const link = require("../js/tempoladder-link.js");
const { getLinkCases } = require("./link-cases.js");

for (const c of getLinkCases(link)) {
  test(c.name, () => c.fn(assert, link));
}
