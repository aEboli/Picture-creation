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

test("root layout no longer depends on next/font/google at build time", () => {
  const layoutContent = readSource("app", "layout.tsx");
  const uiCssContent = readSource("app", "ui-ux-pro-max.css");

  assert.doesNotMatch(layoutContent, /next\/font\/google/);
  assert.doesNotMatch(layoutContent, /DM_Sans/);
  assert.doesNotMatch(layoutContent, /Playfair_Display/);
  assert.doesNotMatch(layoutContent, /bodyFont\.variable/);
  assert.doesNotMatch(layoutContent, /displayFont\.variable/);
  assert.match(layoutContent, /<body>/);

  assert.match(uiCssContent, /--font-sans:/);
  assert.match(uiCssContent, /--font-display:/);
  assert.match(uiCssContent, /--font-ui: var\(--font-sans\)/);
  assert.match(uiCssContent, /--font-display-stack: var\(--font-display\)/);
});
