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

function readCreateFormSource() {
  return fs.readFileSync(path.join(projectRoot, "components", "create-job-form.tsx"), "utf8");
}

test("prompt mode source uses promptInputs array semantics with add/remove controls", () => {
  const content = readCreateFormSource();

  assert.match(content, /promptInputs:\s*\[""\]/);
  assert.match(content, /payload\.promptInputs\.map\(\(promptInput,\s*promptIndex\)\s*=>/);
  assert.match(content, /promptInputs:\s*\[\.\.\.current\.promptInputs,\s*""\]/);
  assert.match(content, /const nextPromptInputs = current\.promptInputs\.filter\(\(_, promptIndex\) => promptIndex !== index\);/);
  assert.match(content, /disabled=\{payload\.promptInputs\.length <= 1\}/);
});

test("prompt mode source removes negative prompt UI and hides quantity input in prompt mode", () => {
  const content = readCreateFormSource();

  assert.doesNotMatch(content, /text\.customNegativePrompt/);
  assert.doesNotMatch(content, /payload\.customNegativePrompt/);
  assert.match(content, /payload\.creationMode !== "reference-remix" && payload\.creationMode !== "prompt"/);
});

test("prompt mode source updates helper copy and request summary to use prompt count", () => {
  const content = readCreateFormSource();

  assert.match(content, /promptModePanelHintNoSources:\s*"With no source images uploaded, prompt mode supports text-to-image generation\."/);
  assert.match(content, /promptModePanelHintWithSources:\s*"When multiple source images are uploaded, they are treated as a joint reference input and each prompt generates one image\."/);
  assert.match(content, /normalizedPromptInputs\.length/);
  assert.match(content, /promptRequestCount\s*=/);
});

test("draft restore and submit source migrates legacy customPrompt to promptInputs and drops customNegativePrompt path", () => {
  const content = readCreateFormSource();

  assert.match(content, /const migratedPromptInputs = normalizePromptInputs\(/);
  assert.match(content, /draftPayload\.customPrompt/);
  assert.match(content, /promptInputs:\s*migratedPromptInputs,/);
  assert.match(content, /promptInputs:\s*payload\.creationMode === "prompt"\s*\?\s*normalizedPromptInputs\s*:\s*undefined/);
  assert.match(content, /customNegativePrompt:\s*payload\.creationMode === "prompt"\s*\?\s*undefined\s*:/);
});
