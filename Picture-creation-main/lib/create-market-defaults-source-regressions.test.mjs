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

test("create form market defaults stay United States and English regardless of UI language", () => {
  const createForm = readSource("components", "create-job-form.tsx");

  assert.match(createForm, /country:\s*"US"/);
  assert.match(createForm, /language:\s*"en-US"/);
  assert.match(createForm, /platform:\s*"amazon"/);
  assert.match(createForm, /function getDefaultMarketState\(\)/);
  assert.doesNotMatch(createForm, /getDefaultMarketState\(language\)/);
  assert.doesNotMatch(createForm, /uiLanguage === "zh"\s*\?\s*\{\s*country:\s*"CN",\s*language:\s*"zh-CN",\s*platform:\s*"tmall"\s*\}/);
});
