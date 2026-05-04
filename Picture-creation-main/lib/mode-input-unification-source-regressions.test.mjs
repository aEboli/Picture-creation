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

test("create form source keeps all workbench areas visible on the same surface", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(uiContent, /CREATE_MODE_CLASS_NAMES/);
  assert.match(uiContent, /type WorkbenchAreaKey = "assets" \| "brief" \| "settings" \| "submit"/);
  assert.match(uiContent, /className="create-workbench-banner"/);
  assert.match(uiContent, /className="create-area-dock"/);
  assert.doesNotMatch(uiContent, /className="create-area-nav"/);
  assert.doesNotMatch(uiContent, /create-area-nav-shell/);
  assert.match(uiContent, /"Assets"\}/);
  assert.match(uiContent, /"Generate"\}/);
  assert.doesNotMatch(uiContent, /role="tabpanel"/);
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
  assert.match(cssContent, /CREATE WORKBENCH UNIFIED MAIN AREA PASS/);
  assert.match(cssContent, /CREATE WORKBENCH SAME SURFACE PASS/);
  assert.match(cssContent, /CREATE WORKBENCH FILL SURFACE PASS/);
  assert.match(cssContent, /CREATE WORKBENCH FLAT SURFACE PASS/);
  assert.match(cssContent, /\.create-workbench-banner\s*\{/);
  assert.match(cssContent, /\.create-area-dock\s*\{/);
  assert.doesNotMatch(cssContent, /\.create-area-nav/);
  assert.match(cssContent, /\.create-area-panels\s*\{[\s\S]*display: grid;[\s\S]*"assets assets assets assets brief brief brief settings settings settings submit submit"[\s\S]*"assets assets assets assets market market market settings settings settings submit submit"[\s\S]*overflow: hidden;/);
  assert.match(cssContent, /\.create-area-panel\s*\{[\s\S]*display: contents;/);
  assert.match(cssContent, /\.create-area-panel-stage\s*\{[\s\S]*height: 100%;[\s\S]*overflow: auto;/);
  assert.match(cssContent, /\.create-area-panel-stage\.is-assets \.create-source-panel,[\s\S]*\.create-area-panel-stage\.is-submit \.create-submit-panel\s*\{[\s\S]*height: 100%;/);
  assert.match(cssContent, /\.create-area-panel:not\(\.is-active\)\s*\{\s*display: contents;/);
  assert.match(cssContent, /\.create-area-panel-stage\.is-assets\s*\{\s*grid-area: assets;/);
  assert.match(cssContent, /\.create-area-panel-stage\.is-submit\s*\{[\s\S]*grid-template-rows: minmax\(0, 1fr\);[\s\S]*align-items: stretch;/);
  assert.match(cssContent, /\.create-area-panel-stage\.is-brief > \.create-base-panel\s*\{[\s\S]*grid-area: brief;/);
  assert.match(cssContent, /\.create-area-panel-stage\.is-brief > \.create-market-panel\s*\{[\s\S]*grid-area: market;/);
  assert.match(cssContent, /\.create-area-panel-stage\.is-submit\s*\{\s*grid-area: submit;/);
  assert.match(cssContent, /\.create-area-panels > \.create-area-panel > \.create-area-panel-stage > \.create-panel,[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.doesNotMatch(cssContent, /\.create-area-panel\.is-active \.create-panel/);
  assert.match(cssContent, /grid-template-areas:\s*"banner"\s*"workbench";/);
  assert.match(cssContent, /\.create-mode-option\s*\{/);
  assert.match(cssContent, /\.create-standard-fields\s*\{/);
  assert.match(cssContent, /\.create-suite-fields\s*,\s*\n\.create-amazon-fields\s*\{/);
  assert.match(cssContent, /\.create-reference-status-grid\s*\{/);
});
