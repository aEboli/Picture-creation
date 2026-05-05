import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compileTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(transpiled, {
    module,
    exports: module.exports,
    require: () => {
      throw new Error("No external imports expected");
    },
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    process,
  }, { filename: filePath });

  return module.exports;
}

test("resolveMappedPromptInputs trims suggestions and pads blanks up to the target count", () => {
  const { resolveMappedPromptInputs } = compileTsModule(path.join(projectRoot, "lib", "create-agent-prompt-mapping.ts"));

  const mapped = resolveMappedPromptInputs({
    promptSuggestions: ["  Prompt A  ", "", "Prompt B", "   ", "Prompt C"],
    targetPromptCount: 5,
  });

  assert.deepEqual([...mapped], ["Prompt A", "Prompt B", "Prompt C", "", ""]);
});

test("resolveMappedPromptInputs truncates suggestions when the target count is smaller", () => {
  const { resolveMappedPromptInputs } = compileTsModule(path.join(projectRoot, "lib", "create-agent-prompt-mapping.ts"));

  const mapped = resolveMappedPromptInputs({
    promptSuggestions: ["Prompt A", "Prompt B", "Prompt C"],
    targetPromptCount: 2,
  });

  assert.deepEqual([...mapped], ["Prompt A", "Prompt B"]);
});

test("resolveMappedPromptInputs falls back to the valid suggestion count when target count is unavailable", () => {
  const { resolveMappedPromptInputs } = compileTsModule(path.join(projectRoot, "lib", "create-agent-prompt-mapping.ts"));

  const mapped = resolveMappedPromptInputs({
    promptSuggestions: ["Prompt A", "", "Prompt B"],
    targetPromptCount: null,
  });

  assert.deepEqual([...mapped], ["Prompt A", "Prompt B"]);
});

test("resolveMappedPromptInputs guarantees at least one prompt slot even if suggestions are empty", () => {
  const { resolveMappedPromptInputs } = compileTsModule(path.join(projectRoot, "lib", "create-agent-prompt-mapping.ts"));

  const mapped = resolveMappedPromptInputs({
    promptSuggestions: [],
    targetPromptCount: 0,
  });

  assert.deepEqual([...mapped], [""]);
});
