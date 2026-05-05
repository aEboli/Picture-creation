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

function read(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("create job submission forwards browser-only API settings as a temporary provider override", () => {
  const createForm = read("components", "create-job-form.tsx");

  assert.match(createForm, /readBrowserApiSettings/);
  assert.match(createForm, /const browserApiSettings = readBrowserApiSettings\(\)/);
  assert.match(createForm, /browserApiSettings\.apiKey\.trim\(\)/);
  assert.match(createForm, /temporaryProvider:\s*\{/);
  assert.match(createForm, /provider:\s*browserApiSettings\.provider/);
  assert.match(createForm, /apiKey:\s*browserApiSettings\.apiKey/);
  assert.match(createForm, /apiBaseUrl:\s*browserApiSettings\.apiBaseUrl/);
  assert.match(createForm, /apiHeaders:\s*browserApiSettings\.apiHeaders/);
  assert.match(createForm, /textModel:\s*browserApiSettings\.textModel/);
  assert.match(createForm, /imageModel:\s*browserApiSettings\.imageModel/);
});

test("successful API connection tests persist browser-only API settings for later generation", () => {
  const settingsForm = read("components", "settings-form.tsx");
  const serviceDrawer = read("components", "service-settings-drawer.tsx");

  assert.match(settingsForm, /if \(providerResult\.ok\) \{\s*writeLocalApiSettings\(formState\);\s*\}/);
  assert.match(serviceDrawer, /if \(providerResult\.ok\) \{\s*writeLocalApiSettings\(formState\);\s*\}/);
});
