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

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sourcePath(...parts) {
  return path.join(projectRoot, ...parts);
}

test("homepage source uses the compact dashboard hero, metrics grid, and action grid", () => {
  const pageContent = read(sourcePath("app", "page.tsx"));
  const cssContent = [
    read(sourcePath("app", "globals.css")),
    read(sourcePath("app", "ui-ux-pro-max.css")),
  ].join("\n");

  assert.match(pageContent, /className="dashboard"/);
  assert.match(pageContent, /dashboard-hero/);
  assert.match(pageContent, /dashboard-status-row/);
  assert.match(pageContent, /dashboard-title/);
  assert.match(pageContent, /dashboard-metrics/);
  assert.match(pageContent, /dashboard-action-card/);
  assert.doesNotMatch(pageContent, /overview-slot-jobs/);
  assert.doesNotMatch(pageContent, /overview-slot-create/);

  assert.match(cssContent, /\.dashboard\s*\{[\s\S]*display:\s*flex;/);
  assert.match(cssContent, /\.dashboard-hero\s*\{[\s\S]*justify-content:\s*space-between;/);
  assert.match(cssContent, /\.dashboard-metrics\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*1fr\);/);
  assert.match(cssContent, /\.dashboard-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*1fr\);/);
  assert.match(cssContent, /@media \(min-width:\s*721px\)\s*\{[\s\S]*\.dashboard\s*\{[\s\S]*grid-template-rows:/);
});
