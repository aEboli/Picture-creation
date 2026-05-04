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

test("source upload automatically infers single-image or multi-image semantics", () => {
  const createForm = read(sourcePath("components", "create-job-form.tsx"));
  const createJob = read(sourcePath("lib", "server", "generation", "create-job.ts"));
  const payloadSource = read(sourcePath("lib", "server", "generation", "payload.ts"));
  const semanticsSource = read(sourcePath("lib", "generation-semantics.ts"));

  assert.match(semanticsSource, /export const AUTO_SOURCE_IMAGE_LIMIT = 5;/);
  assert.match(semanticsSource, /export function inferGenerationSemanticsFromSourceCount/);
  assert.match(semanticsSource, /sourceImageCount > 1 \? "joint" : "batch"/);

  assert.doesNotMatch(createForm, /generationSemanticsSelector/);
  assert.doesNotMatch(createForm, /create-generation-semantics-toggle/);
  assert.doesNotMatch(createForm, /generationSemanticsBatch/);
  assert.doesNotMatch(createForm, /generationSemanticsJoint/);
  assert.doesNotMatch(createForm, /generationSemanticsLabel/);
  assert.doesNotMatch(createForm, /多图联合/);
  assert.doesNotMatch(createForm, /批量模板/);

  assert.match(createForm, /const effectiveGenerationSemantics = inferGenerationSemanticsFromSourceCount\(files\.length\);/);
  assert.match(createForm, /const sourceLimit = isSingleSourceMode \? 1 : AUTO_SOURCE_IMAGE_LIMIT;/);
  assert.match(createForm, /generationSemantics: effectiveGenerationSemantics,/);
  assert.match(createForm, /multiple=\{!isSingleSourceMode\}/);

  assert.match(createJob, /generationSemantics: inferGenerationSemanticsFromSourceCount\(sourceFiles\.length\),/);
  assert.match(payloadSource, /sourceFileCount > AUTO_SOURCE_IMAGE_LIMIT/);
});
