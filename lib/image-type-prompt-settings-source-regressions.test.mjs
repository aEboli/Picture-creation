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

test("settings source exposes editable image-type prompts for the first three creation modes", () => {
  const settingsForm = read(sourcePath("components", "settings-form.tsx"));
  const helper = read(sourcePath("lib", "image-type-prompts.ts"));
  const types = read(sourcePath("lib", "types.ts"));
  const serverConfig = read(sourcePath("lib", "server-config.ts"));
  const db = read(sourcePath("lib", "db.ts"));

  assert.match(helper, /export const IMAGE_TYPE_PROMPT_MODES/);
  assert.match(helper, /standard:[\s\S]*"scene"/);
  assert.match(helper, /suite:[\s\S]*"main-image"/);
  assert.match(helper, /"amazon-a-plus":[\s\S]*"poster"/);
  assert.match(helper, /parseImageTypePromptOverrides/);
  assert.match(helper, /serializeImageTypePromptOverrides/);
  assert.match(helper, /resolveImageTypePrompt/);
  assert.match(helper, /SYSTEM_PROMPT_FOUNDATION/);
  assert.match(helper, /SUBJECT_CATEGORY_ANALYSIS_DIRECTIVE/);
  assert.match(helper, /analyze the supplied subject/);
  assert.match(helper, /infer the most specific category/);
  assert.match(helper, /Mode directive:/);
  assert.match(helper, /Section directive:/);
  assert.doesNotMatch(helper, /marketplace-friendly clarity/);

  assert.match(settingsForm, /settings-card-prompts/);
  assert.match(settingsForm, /text\.sections\.imageTypePrompts/);
  assert.match(settingsForm, /IMAGE_TYPE_PROMPT_MODES\.map/);
  assert.match(settingsForm, /updateImageTypePrompt/);
  assert.match(settingsForm, /formState\.imageTypePromptOverridesJson/);

  assert.match(types, /imageTypePromptOverridesJson: string/);
  assert.match(serverConfig, /imageTypePromptOverridesJson:\s*"{}"/);
  assert.match(db, /image_type_prompt_overrides_json/);
});

test("generation source injects resolved image-type prompts into both provider prompt builders", () => {
  const processJob = read(sourcePath("lib", "server", "generation", "process-job.ts"));
  const gemini = read(sourcePath("lib", "gemini.ts"));
  const openaiProvider = read(sourcePath("lib", "openai-provider.ts"));

  assert.match(processJob, /resolveImageTypePrompt/);
  assert.match(processJob, /mode:\s*structuredAgentMode/);
  assert.match(processJob, /imageTypePrompt:/);

  assert.match(gemini, /imageTypePrompt\?: string/);
  assert.match(gemini, /Image-type prompt rule:/);
  assert.match(openaiProvider, /imageTypePrompt\?: string/);
  assert.match(openaiProvider, /Image-type prompt rule:/);
});

test("create console keeps output parameter controls inside the workbench", () => {
  const createForm = read(sourcePath("components", "create-job-form.tsx"));
  const stylesheet = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(createForm, /create-area-panel-settings/);
  assert.match(createForm, /create-output-panel/);
  assert.match(createForm, /ASPECT_RATIOS\.map/);
  assert.match(createForm, /resolutionOptions\.map/);
  assert.match(createForm, /const imageTypeFieldset = isStructuredCommerceMode \? \(/);
  assert.match(createForm, /create-generation-fieldset-ratios/);
  assert.match(createForm, /create-generation-fieldset-resolutions/);
  assert.match(createForm, /create-area-panel-submit[\s\S]*\{imageTypeFieldset\}[\s\S]*create-quantity-submit-group/);
  assert.doesNotMatch(createForm, /生成确认|Generation checkout/);

  assert.match(stylesheet, /grid-template-areas:[\s\S]*settings[\s\S]*submit/);
  assert.match(stylesheet, /\.create-area-panel-stage\.is-settings/);
  assert.match(stylesheet, /\.create-area-panel-stage\.is-submit \.create-generation-fieldset-types/);
  assert.match(stylesheet, /\.create-area-panel-stage\.is-submit \.chip-grid-types[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
});

test("image-type prompt settings stay collapsed and scroll within their own panel", () => {
  const settingsForm = read(sourcePath("components", "settings-form.tsx"));
  const stylesheet = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(settingsForm, /settings-card-prompts-summary/);
  assert.doesNotMatch(settingsForm, /open=\{mode === "standard"/);

  assert.match(stylesheet, /\.settings-card-prompts\[open\] \.settings-prompt-mode-stack/);
  assert.match(stylesheet, /\.settings-card-prompts:not\(\[open\]\) > \.settings-prompt-mode-stack[\s\S]*display:\s*none/);
  assert.match(stylesheet, /\.settings-prompt-mode\[open\] \.settings-prompt-grid[\s\S]*max-height/);
  assert.match(stylesheet, /\.settings-prompt-mode\[open\] \.settings-prompt-grid[\s\S]*overflow:\s*auto/);
});
