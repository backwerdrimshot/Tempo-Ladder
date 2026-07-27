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
assert.deepEqual(
  Object.keys(workers.workflow.on),
  ["workflow_dispatch"],
  "Workers production deployment must be manual only",
);
assert.equal(
  workers.workflow.jobs.deploy.environment,
  "cloudflare-workers-production",
  "Workers deploy job must use the production GitHub environment",
);
assert.match(workers.source, /secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(workers.source, /secrets\.CLOUDFLARE_ACCOUNT_ID/);

const pages = workflows.get("pages.yml");
assert.ok(pages, "pages.yml must exist");
assert.match(pages.source, /pnpm build:pages/);
assert.match(pages.source, /path:\s*dist/);

const ci = workflows.get("ci.yml");
assert.ok(ci, "ci.yml must exist");
for (const command of ["pnpm lint", "pnpm test", "pnpm build", "pnpm build:pages", "pnpm deploy:dry-run"]) {
  assert.ok(ci.source.includes(command), `ci.yml must run ${command}`);
}

console.log(`Parsed and validated ${files.length} GitHub Actions workflows.`);
