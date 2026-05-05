import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compileTsModule(filePath, stubs) {
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

  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (specifier) => {
        if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
          return stubs[specifier];
        }
        throw new Error(`Missing stub for import "${specifier}" while evaluating ${filePath}`);
      },
      __filename: filePath,
      __dirname: path.dirname(filePath),
      console,
    },
    { filename: filePath },
  );

  return module.exports;
}

const payloadModule = compileTsModule(path.join(projectRoot, "lib", "server", "generation", "payload.ts"), {
  "server-only": {},
  "@/lib/generation-semantics": {
    getPlannedRequestCount() {
      return 1;
    },
    getRequestImageCount() {
      return 1;
    },
    normalizeGenerationSemantics(value) {
      return value || "joint";
    },
  },
  "@/lib/image-model-limits": {
    getMaxImagesPerPromptForModel() {
      return Number.POSITIVE_INFINITY;
    },
  },
});

test("sanitizeTemporaryProvider ignores a legacy API version-only override", () => {
  assert.equal(payloadModule.sanitizeTemporaryProvider({ apiVersion: "v1beta" }), undefined);
});

test("sanitizeTemporaryProvider keeps complete API URL override fields", () => {
  assert.deepEqual(
    payloadModule.sanitizeTemporaryProvider({
      apiKey: "key",
      apiBaseUrl: "https://relay.example.test/v1beta",
      apiHeaders: '{"X-Test":"1"}',
    }),
    {
      apiKey: "key",
      apiBaseUrl: "https://relay.example.test/v1beta",
      apiHeaders: '{"X-Test":"1"}',
    },
  );
});
