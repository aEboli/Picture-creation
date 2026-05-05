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
  assert.match(cssContent, /\.app-header-insight-rail\s*\{[\s\S]*grid-area:\s*stats;/);
  assert.match(cssContent, /\.app-header-center-cluster\s*\{[\s\S]*grid-area:\s*center;/);
  assert.match(cssContent, /\.app-header-control-cluster\s*\{[\s\S]*grid-area:\s*controls;/);
  assert.match(cssContent, /\.app-header-center-cluster\s*\{[\s\S]*justify-content:\s*center;/);
  assert.match(
    cssContent,
    /@media \(max-width:\s*1280px\)\s*\{[\s\S]*\.app-header-center-cluster\s*\{[\s\S]*justify-content:\s*flex-start;/,
  );
});

test("settings source uses one complete API URL input without a separate API version field", () => {
  const settingsForm = read(sourcePath("components", "settings-form.tsx"));
  const createForm = read(sourcePath("components", "create-job-form.tsx"));

  assert.match(settingsForm, /完整 Responses API URL \/ 中转地址/);
  assert.match(settingsForm, /Full Responses API URL \/ relay URL/);
  assert.match(settingsForm, /placeholder="https:\/\/api\.asxs\.top\/v1\/responses"/);
  assert.doesNotMatch(settingsForm, /text\.labels\.defaultApiVersion/);
  assert.doesNotMatch(settingsForm, /patchSettings\(\{ defaultApiVersion:/);
  assert.doesNotMatch(createForm, /temporaryApiVersion/);
  assert.doesNotMatch(createForm, /apiVersion: payload\.temporaryApiVersion/);
});

test("connection status UI labels the provider probe as API instead of Gemini", () => {
  const navigation = read(sourcePath("components", "navigation.tsx"));
  const sidebarNav = read(sourcePath("components", "sidebar-nav.tsx"));
  const homePage = read(sourcePath("app", "page.tsx"));
  const settingsForm = read(sourcePath("components", "settings-form.tsx"));
  const serviceDrawer = read(sourcePath("components", "service-settings-drawer.tsx"));

  assert.match(navigation, /label:\s*"API",\s*state:\s*integrations\.gemini/);
  assert.doesNotMatch(navigation, /label:\s*"Gemini",\s*state:\s*integrations\.gemini/);

  assert.match(sidebarNav, /label:\s*"API",\s*state:\s*integrations\.gemini/);
  assert.doesNotMatch(sidebarNav, /label:\s*"Gemini",\s*state:\s*integrations\.gemini/);

  assert.match(homePage, /label:\s*"API",\s*state:\s*integrations\.gemini/);
  assert.doesNotMatch(homePage, /label:\s*"Gemini",\s*state:\s*integrations\.gemini/);

  assert.match(settingsForm, /<option value="gemini">API \/ 中转<\/option>/);
  assert.doesNotMatch(settingsForm, />Gemini \/ 中转<\/option>/);
  assert.match(settingsForm, /providerOk:\s*"API \/ relay connection succeeded"/);
  assert.match(settingsForm, /providerFailed:\s*"API \/ relay connection failed"/);
  assert.doesNotMatch(settingsForm, /Gemini \/ relay connection/);

  assert.match(serviceDrawer, /<option value="gemini">API \/ 中转<\/option>/);
  assert.doesNotMatch(serviceDrawer, />Gemini \/ 中转<\/option>/);
});

test("settings source uses centered hero, L-shaped desktop cards, and dual global footer actions", () => {
  const settingsForm = read(sourcePath("components", "settings-form.tsx"));
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(settingsForm, /settings-hero/);
  assert.match(settingsForm, /settings-hero-title/);
  assert.match(settingsForm, /settings-l-layout/);
  assert.match(settingsForm, /settings-card settings-card-gemini is-info/);
  assert.match(settingsForm, /settings-card settings-card-feishu is-danger/);
  assert.match(settingsForm, /settings-card settings-card-storage is-accent/);
  assert.match(settingsForm, /settings-actions-footer/);
  assert.match(settingsForm, /settings-actions-row/);
  assert.match(settingsForm, /settings-action-button settings-action-button-test/);
  assert.match(settingsForm, /settings-action-button settings-action-button-save/);
  assert.match(settingsForm, /type="submit"[\s\S]*text\.actions\.save/);
  assert.match(settingsForm, /onClick=\{handleCombinedConnectionTest\}[\s\S]*text\.actions\.testAllConnections/);
  assert.match(settingsForm, /function handleCombinedConnectionTest\(\)/);
  assert.match(settingsForm, /await handleJsonRequest\([\s\S]*"\/api\/settings\/test"/);
  assert.match(settingsForm, /await handleJsonRequest\([\s\S]*"\/api\/settings\/test-feishu"/);
  assert.match(settingsForm, /setCombinedTestMessage\(/);
  assert.match(settingsForm, /const combinedFeedback = combinedTestMessage \|\| message;/);
  assert.doesNotMatch(settingsForm, /settings-console-strip/);
  assert.doesNotMatch(settingsForm, /settings-console-grid/);
  assert.doesNotMatch(settingsForm, /settings-card-save-button/);
  assert.doesNotMatch(settingsForm, /function handleCardSave\(\)/);
  assert.doesNotMatch(settingsForm, /text\.actions\.testProvider/);
  assert.doesNotMatch(settingsForm, /text\.actions\.testFeishu/);
  assert.doesNotMatch(settingsForm, /settings-submit-strip/);
  assert.match(settingsForm, /function handleSubmit\(event: FormEvent<HTMLFormElement>\)[\s\S]*void submitSettings\(\);/);
  assert.match(settingsForm, /const globalFeedback = combinedFeedback;/);
  assert.match(
    settingsForm,
    /const successPrefixes = \[text\.actions\.saved, text\.actions\.testAllOk\];/,
  );
  assert.match(
    settingsForm,
    /const failedPrefixes = \[text\.actions\.saveFailed, text\.actions\.testAllFailed\];/,
  );
  assert.match(settingsForm, /const matchesPrefix = \(prefix: string\) => globalFeedback === prefix \|\| globalFeedback\.startsWith\(`\$\{prefix\}:`\);/);
  assert.match(settingsForm, /function handleSubmit[\s\S]*setCombinedTestMessage\(""\);/);
  assert.match(
    settingsForm,
    /function handleFormatMapping\(\)[\s\S]*setCombinedTestMessage\(`\$\{text\.actions\.testAllFailed\}: \$\{text\.actions\.feishuFailed\}: \$\{reason\}`\);/,
  );

  assert.match(cssContent, /\.settings-hero\s*\{/);
  assert.match(cssContent, /\.settings-hero-title\s*\{/);
  assert.match(cssContent, /\.settings-l-layout\s*\{/);
  assert.match(cssContent, /\.settings-card-gemini\s*\{/);
  assert.match(cssContent, /\.settings-card-feishu\s*\{/);
  assert.match(cssContent, /\.settings-card-storage\s*\{/);
  assert.match(cssContent, /\.settings-actions-footer\s*\{/);
  assert.match(cssContent, /\.settings-actions-row\s*\{/);
  assert.match(cssContent, /\.settings-action-button\s*\{/);
  assert.match(cssContent, /\.settings-l-layout\s*\{[\s\S]*grid-template-areas:\s*"gemini feishu"\s*"gemini storage";/);
  assert.doesNotMatch(cssContent, /\.settings-console-strip\s*\{/);
  assert.doesNotMatch(cssContent, /\.settings-console-grid\s*\{/);
  assert.doesNotMatch(cssContent, /\.settings-submit-strip\s*\{/);
  assert.doesNotMatch(cssContent, /\.settings-card-save-button\s*\{/);
  assert.doesNotMatch(cssContent, /\.settings-card-footer-actions\s*\{/);
  assert.doesNotMatch(cssContent, /\.settings-card-wide-row\s*\{/);
  assert.match(
    cssContent,
    /@media \(max-width:\s*1023px\)\s*\{[\s\S]*\.settings-l-layout\s*\{[\s\S]*grid-template-areas:\s*"gemini"\s*"feishu"\s*"storage";/,
  );
  assert.match(
    cssContent,
    /@media \(max-width:\s*720px\)\s*\{[\s\S]*\.settings-feishu-connection-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
  assert.match(
    cssContent,
    /@media \(max-width:\s*720px\)\s*\{[\s\S]*\.settings-feishu-connection-grid\s+\.settings-field-span-2\s*\{[\s\S]*grid-column:\s*span 1;/,
  );
  assert.match(
    cssContent,
    /@media \(max-width:\s*720px\)\s*\{[\s\S]*\.settings-actions-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/,
  );
});
