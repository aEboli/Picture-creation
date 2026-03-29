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

test("homepage source uses a centered symmetric hero and a 3x2 symmetric grid", () => {
  const pageContent = read(sourcePath("app", "page.tsx"));
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(pageContent, /overview-symmetric-shell/);
  assert.match(pageContent, /overview-symmetric-hero/);
  assert.match(pageContent, /overview-symmetric-grid/);
  assert.match(pageContent, /overview-symmetric-status-rail/);
  assert.match(pageContent, /overview-symmetric-title/);
  assert.doesNotMatch(pageContent, /overview-slot-jobs/);
  assert.doesNotMatch(pageContent, /overview-slot-create/);

  assert.match(cssContent, /\.overview-symmetric-shell/);
  assert.match(cssContent, /\.overview-symmetric-hero/);
  assert.match(cssContent, /\.overview-symmetric-grid/);
  assert.match(cssContent, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
});
