import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { RESOLUTIONS, normalizeSelectedResolutions } from "./constants.ts";
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

test("resolution options retire 0.5K and normalize legacy/invalid selections", () => {
  assert.deepEqual(
    RESOLUTIONS.map((option) => option.value),
    ["1K", "2K", "4K"],
  );

  assert.deepEqual(normalizeSelectedResolutions(["0.5K"]), ["1K"]);
  assert.deepEqual(normalizeSelectedResolutions(["512px"]), ["1K"]);
  assert.deepEqual(normalizeSelectedResolutions(["2K"]), ["2K"]);
  assert.deepEqual(normalizeSelectedResolutions(["unknown-resolution"]), ["1K"]);
});

test("create form migrates legacy resolution drafts and normalizes state to supported set", () => {
  const content = readSource("components", "create-job-form.tsx");

  assert.match(content, /normalizeSelectedResolutions\(draft\.selectedResolutions\)/);
  assert.match(content, /normalizeSelectedResolutions\(selectedResolutions\)/);
});

test("payload validation explicitly rejects legacy 0.5K resolution instead of upgrading server-side", () => {
  const content = readSource("lib", "server", "generation", "payload.ts");

  assert.match(content, /selectedResolutions\.some\(\(resolution\) => LEGACY_HALF_K_RESOLUTIONS\.has\(resolution\)\)/);
  assert.match(content, /0\.5K/);
  assert.match(content, /1K/);
  assert.match(content, /2K/);
  assert.match(content, /4K/);
});

test("provider request INVALID_ARGUMENT for legacy 0.5K surfaces a clear unsupported-resolution error", () => {
  const providerError = new Error(
    JSON.stringify({
      error: {
        status: "INVALID_ARGUMENT",
        message: "imageConfig.imageSize is invalid: got 0.5K, expected one of 1K, 2K, 4K.",
      },
    }),
  );

  Object.assign(providerError, {
    providerDebug: {
      failureStage: "provider-request",
      failureReason: "INVALID_ARGUMENT: imageConfig.imageSize is invalid: got 0.5K",
    },
  });

  const normalized = normalizeProviderError(providerError);

  assert.match(normalized, /0\.5K/);
  assert.match(normalized, /1K/);
  assert.match(normalized, /2K/);
  assert.match(normalized, /4K/);
  assert.doesNotMatch(normalized, /Provider request failed before a response was returned\./);
});
