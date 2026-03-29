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

test("create page source removes helper-only usage copy from the main form", () => {
  const content = read(sourcePath("components", "create-job-form.tsx"));

  assert.doesNotMatch(content, /<p className="helper">\{text\.dropToUpload\}<\/p>/);
  assert.doesNotMatch(content, /<p className="helper">\{text\.livePreviewEmpty\}<\/p>/);
  assert.doesNotMatch(content, /<p className="helper">\{text\.referencePreviewEmpty\}<\/p>/);
  assert.doesNotMatch(content, /<small className="helper">\{text\.strategyWorkbenchHint\}<\/small>/);
  assert.doesNotMatch(content, /<small className="helper">\{text\.brandLibraryHint\}<\/small>/);
  assert.doesNotMatch(content, /<small className="helper">\{suiteModeInfoText\}<\/small>/);
  assert.doesNotMatch(content, /<small className="helper">\{suiteModulesSummary\}<\/small>/);
  assert.doesNotMatch(content, /<small className="helper">\{amazonAPlusModeInfoText\}<\/small>/);
  assert.doesNotMatch(content, /<small className="helper">\{amazonAPlusModulesSummary\}<\/small>/);
  assert.doesNotMatch(content, /<small className="helper">\{amazonAPlusContextHint\}<\/small>/);
  assert.doesNotMatch(content, /<p>\{referenceRemixModeInfoText\}<\/p>/);
  assert.doesNotMatch(content, /<p>\{referenceRemixWorkflowSummary\}<\/p>/);
});

test("details source removes explanatory helper copy while keeping result data panels", () => {
  const content = read(sourcePath("components", "job-details-client.tsx"));

  assert.doesNotMatch(content, /<p className="helper">\{text\.variantBrowserHint\}<\/p>/);
  assert.doesNotMatch(content, /<p className="helper">\{currentFocusHint\}<\/p>/);
  assert.doesNotMatch(content, /Keep frequent information in tabs and expand deeper content only when needed\./);
  assert.doesNotMatch(content, /The workspace above stays focused on the current result\. Expand a single variant here only when you need the full record\./);
});

test("settings, brand library, history, and overview sources remove instructional copy blocks", () => {
  const settingsForm = read(sourcePath("components", "settings-form.tsx"));
  const brandLibrary = read(sourcePath("components", "brand-library-manager.tsx"));
  const historyPage = read(sourcePath("app", "history", "page.tsx"));
  const homePage = read(sourcePath("app", "page.tsx"));
  const settingsPage = read(sourcePath("app", "settings", "page.tsx"));

  assert.doesNotMatch(settingsForm, /settings-guide-card/);
  assert.doesNotMatch(settingsForm, /<small className="helper">\{text\.hints\./);
  assert.doesNotMatch(settingsForm, /<p className="helper">\{text\.hints\.saveSummary\}<\/p>/);

  assert.doesNotMatch(brandLibrary, /<p className="helper">\{text\.description\}<\/p>/);
  assert.doesNotMatch(brandLibrary, /<small className="helper">\{text\.helper\}<\/small>/);

  assert.doesNotMatch(historyPage, /history-pagination-summary/);

  assert.doesNotMatch(homePage, /subtitle:/);
  assert.doesNotMatch(homePage, /<span>\{action\.subtitle\}<\/span>/);

  assert.doesNotMatch(settingsPage, /Bring providers, sync workflows, and runtime controls into one console/);
  assert.doesNotMatch(settingsPage, /<p>\{item\.description\}<\/p>/);
  assert.doesNotMatch(settingsPage, /settings-page-intro/);
  assert.doesNotMatch(settingsPage, /page-kpi-grid/);
});

test("brand library lives on its own route and is removed from the settings page", () => {
  const navigation = read(sourcePath("components", "navigation.tsx"));
  const settingsPage = read(sourcePath("app", "settings", "page.tsx"));
  const brandsPage = read(sourcePath("app", "brands", "page.tsx"));

  assert.match(navigation, /href:\s*"\/brands"/);
  assert.doesNotMatch(settingsPage, /BrandLibraryManager/);
  assert.match(brandsPage, /BrandLibraryManager/);
  assert.match(brandsPage, /getSettingsPageData/);
});

test("brand library entry source exposes standalone /brands page and keeps settings focused", () => {
  const navigation = read(sourcePath("components", "navigation.tsx"));
  const settingsPage = read(sourcePath("app", "settings", "page.tsx"));
  const brandsPagePath = sourcePath("app", "brands", "page.tsx");

  assert.match(navigation, /href:\s*"\/brands"/);

  assert.match(settingsPage, /<SettingsForm\b/);
  assert.doesNotMatch(settingsPage, /BrandLibraryManager/);

  assert.equal(fs.existsSync(brandsPagePath), true);
  const brandsPage = read(brandsPagePath);
  assert.match(brandsPage, /getSettingsPageData/);
  assert.match(brandsPage, /BrandLibraryManager/);
});

test("header source groups the create-agent entry and primary nav inside a centered middle cluster", () => {
  const navigation = read(sourcePath("components", "navigation.tsx"));
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(
    navigation,
    /className="app-header-center-cluster">[\s\S]*className="app-header-agent-slot"[\s\S]*className="app-header-nav-shell"/,
  );
  assert.match(cssContent, /\.app-header-center-cluster\s*\{/);
  assert.match(cssContent, /grid-template-areas:\s*"stats center controls"/);
  assert.match(cssContent, /\.app-header-center-cluster\s*\{[\s\S]*justify-content:\s*center;/);
  assert.match(
    cssContent,
    /@media \(max-width:\s*720px\)\s*\{[\s\S]*\.app-header-center-cluster\s*\{[\s\S]*flex-wrap:\s*wrap;/,
  );
});
