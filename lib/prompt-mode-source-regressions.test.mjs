import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("types and db schema include promptInputs/promptInputIndex with legacy fallback support", () => {
  const typesContent = read("lib", "types.ts");
  const dbContent = read("lib", "db.ts");

  assert.match(typesContent, /promptInputs:\s*string\[\];/);
  assert.match(typesContent, /promptInputIndex:\s*number;/);

  assert.match(dbContent, /prompt_inputs_json/);
  assert.match(dbContent, /prompt_input_index/);
  assert.match(dbContent, /ALTER TABLE jobs ADD COLUMN prompt_inputs_json TEXT/);
  assert.match(dbContent, /ALTER TABLE job_items ADD COLUMN prompt_input_index INTEGER/);
  assert.match(dbContent, /promptInputs:\s*fromJson\(row\.prompt_inputs_json,\s*\[\s*row\.custom_prompt \?\? ""\s*]\)/);
});

test("process job uses per-item prompt input mapping and removes prompt-mode negative prompt path", () => {
  const processJobContent = read("lib", "server", "generation", "process-job.ts");

  assert.match(processJobContent, /item\.promptInputIndex/);
  assert.doesNotMatch(processJobContent, /const promptModeInputs\s*=/);
  assert.doesNotMatch(processJobContent, /promptModeInputs\?\.customNegativePrompt/);
  assert.doesNotMatch(processJobContent, /customNegativePrompt:\s*job\.customNegativePrompt/);
  assert.doesNotMatch(processJobContent, /job\.creationMode === "prompt"\s*\?\s*promptModeInputs\?\.customNegativePrompt/);
});

test("prompt-only builders no longer accept prompt-mode negative prompt input", () => {
  const templatesContent = read("lib", "templates.ts");
  const geminiContent = read("lib", "gemini.ts");

  assert.doesNotMatch(templatesContent, /customNegativePrompt\?: string;/);
  assert.doesNotMatch(templatesContent, /Avoid these outcomes:/);

  const optimizeStart = geminiContent.indexOf("export async function optimizeUserImagePrompt");
  const translateStart = geminiContent.indexOf("export async function translateUserPromptInputs");
  const translateEnd = geminiContent.indexOf("function uiLanguageName");
  assert.ok(optimizeStart >= 0 && translateStart > optimizeStart && translateEnd > translateStart);

  const optimizeBlock = geminiContent.slice(optimizeStart, translateStart);
  const translateBlock = geminiContent.slice(translateStart, translateEnd);

  assert.doesNotMatch(optimizeBlock, /customNegativePrompt/);
  assert.doesNotMatch(translateBlock, /customNegativePrompt/);
  assert.match(optimizeBlock, /hasSourceImages\?: boolean/);
  assert.match(optimizeBlock, /input\.hasSourceImages/);
});

test("jobs insert statement keeps column count aligned with inserted values", () => {
  const dbContent = read("lib", "db.ts");
  const insertStart = dbContent.indexOf("INSERT INTO jobs (");
  const valuesStart = dbContent.indexOf(") VALUES (", insertStart);
  const valuesEnd = dbContent.indexOf(")`", valuesStart);

  assert.ok(insertStart >= 0 && valuesStart > insertStart && valuesEnd > valuesStart);

  const columnSection = dbContent.slice(
    dbContent.indexOf("(", insertStart) + 1,
    valuesStart,
  );
  const valueSection = dbContent.slice(valuesStart + ") VALUES (".length, valuesEnd);

  const columns = columnSection
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const values = valueSection
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  assert.equal(values.length, columns.length);
});
