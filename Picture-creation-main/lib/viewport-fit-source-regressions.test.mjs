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

test("desktop pages fit the viewport while long content scrolls inside panels", () => {
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(cssContent, /DESKTOP VIEWPORT FIT PASS/);
  assert.match(cssContent, /@media\s*\(min-width:\s*901px\)/);
  assert.match(
    cssContent,
    /\.create-workspace,\s*\n\s*\.create-workspace\.is-compact-viewport,\s*\n\s*\.create-workspace\.is-cramped-viewport\s*\{[\s\S]*?height:\s*calc\(100dvh - 48px\);/,
  );
  assert.match(
    cssContent,
    /\.settings-form-shell-liquid\s*\{[\s\S]*?height:\s*calc\(100dvh - 48px\);[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    cssContent,
    /\.history-page-liquid\s*\{[\s\S]*?height:\s*calc\(100dvh - 48px\);[\s\S]*?overflow:\s*hidden;/,
  );
  assert.match(
    cssContent,
    /\.history-card-list\s*\{[\s\S]*?overflow:\s*auto;[\s\S]*?align-content:\s*start;/,
  );
  assert.match(
    cssContent,
    /\.create-base-fields,\s*\n\s*\.create-base-side,\s*\n\s*\.create-base-side-stack\s*\{[\s\S]*?overflow:\s*auto;/,
  );
  assert.match(
    cssContent,
    /\.create-workspace\.is-compact-viewport \.create-base-grid,\s*\n\s*\.create-workspace\.is-cramped-viewport \.create-base-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(260px, 0\.48fr\);/,
  );
  assert.match(
    cssContent,
    /\.create-workspace\.is-compact-viewport \.create-base-fields,\s*\n\s*\.create-workspace\.is-cramped-viewport \.create-base-fields,[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*100%;/,
  );
});
