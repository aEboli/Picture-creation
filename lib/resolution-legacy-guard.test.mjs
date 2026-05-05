import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSelectedResolutions, RESOLUTIONS } from "./constants.ts";
import { normalizeProviderError } from "./gemini.ts";

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

test("RESOLUTIONS excludes legacy 0.5K option", () => {
  const labels = RESOLUTIONS.map((option) => option.value);

  assert.equal(labels.includes("0.5K"), false);
  assert.deepEqual(labels, ["1K", "2K", "4K"]);
});

test("resolution normalization migrates legacy 0.5K/512px and invalid values to 1K", () => {
  assert.deepEqual(normalizeSelectedResolutions(["0.5K"]), ["1K"]);
  assert.deepEqual(normalizeSelectedResolutions(["512px"]), ["1K"]);
  assert.deepEqual(normalizeSelectedResolutions(["999K"]), ["1K"]);
  assert.deepEqual(normalizeSelectedResolutions(["2K", "0.5K"]), ["2K", "1K"]);
});

test("create form source uses normalized resolution helper for draft restore and state repair", () => {
  const content = readSource("components", "create-job-form.tsx");

  assert.match(content, /normalizeSelectedResolutions/);
  assert.match(content, /draft\.selectedResolutions/);
  assert.match(content, /setSelectedResolutions\(\[normalizedDraftResolutions\[0\]\]\);/);
  assert.match(content, /\[normalizeSelectedResolutions\(selectedResolutions\)\[0\]\]/);
});

test("payload validation source rejects 0.5K explicitly", () => {
  const content = readSource("lib", "server", "generation", "payload.ts");

  assert.match(content, /LEGACY_HALF_K_RESOLUTIONS/);
  assert.match(content, /selectedResolutions\.some\(\(resolution\) => LEGACY_HALF_K_RESOLUTIONS\.has\(resolution\)\)/);
  assert.match(content, /0\.5K/);
  assert.match(content, /1K/);
  assert.match(content, /2K/);
  assert.match(content, /4K/);
});

test("provider-request INVALID_ARGUMENT with resolution_label 0.5K returns clear unsupported message", () => {
  const message = normalizeProviderError({
    providerDebug: {
      retrievalMethod: "inline",
      failureStage: "provider-request",
      failureReason: "400 INVALID_ARGUMENT: unsupported value 0.5K for resolution_label",
      requestImageCount: 1,
      requestBytes: 1024,
    },
  });

  assert.equal(message, "Resolution 0.5K is no longer supported by the provider. Please select 1K, 2K, or 4K.");
});
