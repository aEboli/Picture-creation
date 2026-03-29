import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("structured modes source no longer auto-generates marketing workbench previews before enqueue", () => {
  const createJobContent = read("lib", "server", "generation", "create-job.ts");

  assert.doesNotMatch(createJobContent, /generateMarketingWorkbenchPreview/);
  assert.doesNotMatch(createJobContent, /isStrategyDrivenCreationMode/);
});

test("structured mode processing routes through the new analysis and prompt agents", () => {
  const processJobContent = read("lib", "server", "generation", "process-job.ts");
  const geminiContent = read("lib", "gemini.ts");

  assert.match(processJobContent, /analyzeProductImageFeatures/);
  assert.match(processJobContent, /generateFeaturePromptCopyBundle/);
  assert.match(geminiContent, /export async function analyzeProductImageFeatures/);
  assert.match(geminiContent, /export async function generateFeaturePromptCopyBundle/);
});

test("prompt engineer source explicitly reuses the uploaded image and enforces subject consistency", () => {
  const processJobContent = read("lib", "server", "generation", "process-job.ts");
  const geminiContent = read("lib", "gemini.ts");

  assert.match(processJobContent, /generateFeaturePromptCopyBundle\(\{[\s\S]*sourceImages,/);
  assert.match(geminiContent, /Use the uploaded product image itself together with the analysis JSON\./);
  assert.match(geminiContent, /Subject consistency with the uploaded image is mandatory\./);
  assert.match(geminiContent, /Use the product name only as a helper hint when it is provided\./);
  assert.match(geminiContent, /Do not follow a fixed template or repeat one preset scene across every image\./);
  assert.match(geminiContent, /Choose the most commercially useful scene according to the product's actual structure, usage logic, and buyer needs\./);
});
