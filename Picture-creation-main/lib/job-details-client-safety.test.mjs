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

test("job details client renders copy summary cards only for prompt/reference-remix modes", () => {
  const detailsContent = readSource("components", "job-details-client.tsx");

  assert.match(
    detailsContent,
    /const showCopySummaryCards = details\.job\.creationMode === "prompt" \|\| details\.job\.creationMode === "reference-remix";/,
  );
  assert.match(detailsContent, /\{showCopySummaryCards && activeItem\.copy \?/);
  assert.match(detailsContent, /\{showCopySummaryCards && item\.copy \?/);
  assert.match(detailsContent, /onClick=\{\(\) => handleCopy\(`prompt-\$\{activeItem\.id\}`, activeItem\.promptText \|\| ""\)\}/);
  assert.match(detailsContent, /onClick=\{\(\) => handleCopy\(`prompt-\$\{item\.id\}`, item\.promptText \|\| ""\)\}/);
});

test("jobs id page and api route use client-safe job details queries", () => {
  const pageContent = readSource("app", "jobs", "[id]", "page.tsx");
  const apiContent = readSource("app", "api", "jobs", "[id]", "route.ts");

  assert.match(pageContent, /getClientSafeJobDetailsForQuery/);
  assert.match(apiContent, /getClientSafeJobDetailsOrThrow/);
});
