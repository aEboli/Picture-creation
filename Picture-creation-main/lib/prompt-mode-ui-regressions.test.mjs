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

test("prompt mode source uses promptInputs array UI and removes prompt-mode negative prompt UI", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));

  assert.match(uiContent, /promptInputs:\s*\[""\]/);
  assert.match(uiContent, /payload\.promptInputs\.map\(\(promptInput,\s*promptIndex\)\s*=>/);
  assert.match(uiContent, /text\.addPromptInput/);
  assert.match(uiContent, /text\.removePromptInput/);
  assert.doesNotMatch(uiContent, /customNegativePrompt:\s*"Negative prompt"/);
  assert.doesNotMatch(uiContent, /customNegativePrompt:\s*"负向提示词"/);
});

test("prompt mode source hides quantity input and migrates legacy draft customPrompt into promptInputs", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));

  assert.match(uiContent, /payload\.creationMode !== "reference-remix" && payload\.creationMode !== "prompt"/);
  assert.match(uiContent, /const migratedPromptInputs = normalizePromptInputs\(/);
  assert.match(uiContent, /draftPayload\.customPrompt/);
  assert.doesNotMatch(uiContent, /draft\.payload\)\s*=>\s*\(\{\s*\.\.\.current,\s*\.\.\.draft\.payload\s*\}\)/);
});

test("prompt mode submit payload sends promptInputs and omits customNegativePrompt", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));

  assert.match(uiContent, /promptInputs:\s*payload\.creationMode === "prompt"\s*\?\s*normalizedPromptInputs\s*:\s*undefined/);
  assert.match(uiContent, /customNegativePrompt:\s*payload\.creationMode === "prompt"\s*\?\s*undefined\s*:/);
});
