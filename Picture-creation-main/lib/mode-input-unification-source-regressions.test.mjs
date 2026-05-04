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

test("create form source uses dedicated workbench branches for every creation mode", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(uiContent, /CREATE_MODE_CLASS_NAMES/);
  assert.match(uiContent, /type WorkbenchAreaKey = "assets" \| "brief" \| "settings" \| "submit"/);
  assert.match(uiContent, /className="create-workbench-banner"/);
  assert.match(uiContent, /className="create-area-dock"/);
  assert.match(uiContent, /className="create-area-nav"/);
  assert.match(uiContent, /onMouseEnter=\{\(\) => setActiveWorkbenchArea\(area\.key\)\}/);
  assert.match(uiContent, /create-mode-option is-standard/);
  assert.match(uiContent, /create-mode-option is-suite/);
  assert.match(uiContent, /create-mode-option is-amazon/);
  assert.match(uiContent, /create-mode-option is-prompt/);
  assert.match(uiContent, /create-mode-option is-reference/);
  assert.match(uiContent, /isStandardMode \? \([\s\S]*create-standard-fields/);
  assert.match(uiContent, /isSuiteMode \? \([\s\S]*create-suite-fields/);
  assert.match(uiContent, /isAmazonMode \? \([\s\S]*create-amazon-fields/);
  assert.match(uiContent, /isPromptMode \? \([\s\S]*create-prompt-fields/);
  assert.match(uiContent, /isReferenceMode \? \([\s\S]*create-reference-fields/);
  assert.doesNotMatch(uiContent, /isStructuredCommerceMode \? \(\s*<>\s*<label/);

  assert.match(cssContent, /CREATE WORKBENCH REMAKE PASS/);
  assert.match(cssContent, /CREATE WORKBENCH PRODUCT MENU PASS/);
  assert.match(cssContent, /\.create-workbench-banner\s*\{/);
  assert.match(cssContent, /\.create-area-dock\s*\{/);
  assert.match(cssContent, /\.create-area-panel:not\(\.is-active\)\s*\{/);
  assert.match(cssContent, /grid-template-areas:\s*"banner"\s*"workbench";/);
  assert.match(cssContent, /\.create-mode-option\s*\{/);
  assert.match(cssContent, /\.create-standard-fields\s*\{/);
  assert.match(cssContent, /\.create-suite-fields\s*,\s*\n\.create-amazon-fields\s*\{/);
  assert.match(cssContent, /\.create-reference-status-grid\s*\{/);
});
