import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { parseDocument } from "yaml";

const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const files = (await readdir(workflowDirectory))
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

assert.ok(files.length > 0, "at least one GitHub Actions workflow is required");

const workflows = new Map();
for (const file of files) {
  const source = await readFile(new URL(file, workflowDirectory), "utf8");
  const document = parseDocument(source, { prettyErrors: true, uniqueKeys: true });
  assert.deepEqual(
    document.errors.map((error) => error.message),
    [],
    `${file} must be valid YAML`,
  );
  const workflow = document.toJS();
  assert.equal(typeof workflow.name, "string", `${file} must have a name`);
  assert.ok(workflow.on, `${file} must have triggers`);
  assert.equal(typeof workflow.jobs, "object", `${file} must have jobs`);
  workflows.set(file, { source, workflow });
}

const workers = workflows.get("workers.yml");
assert.ok(workers, "workers.yml must exist");
/* Production deploys used to be `workflow_dispatch`-only, and this assertion is
   what held that line. The rule it protected was "never publish a build nobody
   validated" — but what it enforced was "never publish without a remembered
   button-press", and on 2026-08-01 the button was not pressed: this app merged
   2026-08-01.4 and served .3 for over an hour with every check green.

   The rule survives; the ceremony does not. A deploy is now chained to the CI
   run, so the only thing that can reach production is a commit "Validate static
   site" already passed. Each half is asserted below, because dropping any one
   of them quietly restores a way to publish something unvalidated. */
assert.deepEqual(
  Object.keys(workers.workflow.on),
  ["workflow_run", "workflow_dispatch"],
  "Workers production deployment must chain off CI, plus a manual escape hatch",
);
assert.deepEqual(
  workers.workflow.on.workflow_run.workflows,
  ["Validate static site"],
  "the Workers deploy must chain off the CI workflow by name",
);
assert.deepEqual(
  workers.workflow.on.workflow_run.branches,
  ["main"],
  "only main may deploy to production",
);
assert.match(
  String(workers.workflow.jobs.deploy.if),
  /workflow_run\.conclusion == 'success'/,
  "the Workers deploy must refuse to publish a failed or cancelled CI run",
);
assert.match(
  workers.source,
  /ref:\s*\$\{\{\s*github\.event\.workflow_run\.head_sha/,
  "the Workers deploy must check out the commit CI validated, not the branch tip",
);
assert.equal(
  workers.workflow.jobs.deploy.environment,
  "cloudflare-workers-production",
  "Workers deploy job must use the production GitHub environment",
);
assert.match(workers.source, /secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(workers.source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);

/* pages.yml was asserted here, and is gone. GitHub Pages published a complete
   second copy of this app on every merge, and the CNAME it shipped claimed
   tempoladder.backwerdrhythmshop.com — the hostname the Cloudflare Worker
   already serves. DNS routes that name to Cloudflare, so the Pages copy was
   unreachable, and its green "Deploy" run on every merge is what disguised the
   deploy that was not happening.

   This asserts it stays gone, because a second deploy path is not a neutral
   spare: it is a second thing that can look like it published. */
assert.ok(!workflows.has("pages.yml"), "there is one deploy path; pages.yml must not come back");

const ci = workflows.get("ci.yml");
assert.ok(ci, "ci.yml must exist");
for (const command of ["pnpm lint", "pnpm test", "pnpm build", "pnpm deploy:dry-run"]) {
  assert.ok(ci.source.includes(command), `ci.yml must run ${command}`);
}

console.log(`Parsed and validated ${files.length} GitHub Actions workflows.`);
