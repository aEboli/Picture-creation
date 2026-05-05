import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findProjectRoot(startDir) {
  let currentDir = startDir;

  for (;;) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));

function readSource(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("job-details query source defines client-safe shaping for standard/suite/amazon-a-plus", () => {
  const content = readSource("lib", "server", "jobs", "queries.ts");

  assert.match(content, /export function shapeJobDetailsForClient/);
  assert.match(content, /creationMode === "standard" \|\| creationMode === "suite" \|\| creationMode === "amazon-a-plus"/);
  assert.match(content, /negativePrompt: null/);
  assert.match(content, /copy: null/);
  assert.match(content, /warningMessage: removeWorkflowWarningMessage/);
  assert.match(content, /const workflowWarning = item\.copy\?\.workflowWarning\?\.trim\(\) \|\| ""/);
  assert.match(content, /split\("\|"\)/);
  assert.match(content, /filter\(\(part\) => part !== normalizedWorkflowWarning\)/);
});

test("job-details query source keeps both client-safe and raw helpers", () => {
  const content = readSource("lib", "server", "jobs", "queries.ts");

  assert.match(content, /export function getClientSafeJobDetailsForQuery/);
  assert.match(content, /export function getRawJobDetailsForQuery/);
  assert.match(content, /export function getClientSafeJobDetailsOrThrow/);
  assert.match(content, /export function getJobDetailsOrThrow/);
});
