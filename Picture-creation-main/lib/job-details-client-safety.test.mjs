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
  assert.match(detailsContent, /onClick=\{\(\) => handleCopy\(`prompt-\$\{item\.id\}`, item\.promptText \|\| ""\)\}/);
  assert.doesNotMatch(detailsContent, /onClick=\{\(\) => handleCopy\(`prompt-\$\{activeItem\.id\}`, activeItem\.promptText \|\| ""\)\}/);
});

test("job details active workspace sidebar no longer renders active failure debug and prompt drawers", () => {
  const detailsContent = readSource("components", "job-details-client.tsx");

  assert.doesNotMatch(detailsContent, /\{activeItem\.errorMessage \?/);
  assert.doesNotMatch(detailsContent, /\{activeItem\.promptText \?/);
});

test("job details main workspace no longer renders the current-focus hero summary strip", () => {
  const detailsContent = readSource("components", "job-details-client.tsx");

  assert.doesNotMatch(detailsContent, /<div className="job-workbench-hero">/);
  assert.doesNotMatch(detailsContent, /<div className="job-workbench-hero-side">/);
});

test("jobs id page and api route use client-safe job details queries", () => {
  const pageContent = readSource("app", "jobs", "[id]", "page.tsx");
  const apiContent = readSource("app", "api", "jobs", "[id]", "route.ts");

  assert.match(pageContent, /getClientSafeJobDetailsForQuery/);
  assert.match(apiContent, /getClientSafeJobDetailsOrThrow/);
});

test("job details variant browser card keeps only thumbnail and image parameters in the main workbench strip", () => {
  const detailsContent = readSource("components", "job-details-client.tsx");
  const cssContent = readSource("app", "ui-ux-pro-max.css");

  assert.match(detailsContent, /className=\{isActive \? "variant-browser-card is-active" : "variant-browser-card"\}/);
  assert.match(detailsContent, /className="variant-browser-thumb"/);
  assert.match(detailsContent, /className="helper variant-browser-meta"/);
  assert.match(detailsContent, /#\{item\.variantIndex\}[\s\S]*\{item\.ratio\}[\s\S]*\{item\.resolutionLabel\}/);
  assert.match(detailsContent, /className="variant-browser-type-chip"/);
  assert.match(detailsContent, /imageTypeLabel\(language, item\.imageType, details\.job\.creationMode\)/);
  assert.match(cssContent, /\.job-workbench-browser \.variant-browser-title,\s*\n\.job-workbench-browser \.variant-browser-tags,\s*\n\.job-workbench-browser \.variant-browser-active-pill\s*\{/);
  assert.match(cssContent, /\.job-workbench-browser \.variant-browser-thumb-placeholder\s*\{/);
  assert.match(cssContent, /\.variant-browser-type-chip\s*\{/);
});

test("job details header exposes all-images download actions alongside approved download", () => {
  const detailsContent = readSource("components", "job-details-client.tsx");

  assert.match(detailsContent, /downloadAllSequential/);
  assert.match(detailsContent, /downloadAllZip/);
  assert.match(detailsContent, /handleDownloadAllSequential/);
  assert.match(detailsContent, /allImagesDownloadUrl/);
  assert.match(detailsContent, /successfulItems/);
});
