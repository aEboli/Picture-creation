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
      process,
      globalThis,
      Promise,
    },
    { filename: filePath },
  );

  return module.exports;
}

test("ensureRuntimeReady is one-time async scheduling only", async () => {
  let ensureQueueReadyCalls = 0;
  const runtimePath = path.join(projectRoot, "lib", "runtime.ts");
  const runtimeModule = compileTsModule(runtimePath, {
    "@/lib/queue": {
      ensureQueueReady: () => {
        ensureQueueReadyCalls += 1;
      },
    },
  });

  delete globalThis.commerceStudioRuntimeStarted;

  runtimeModule.ensureRuntimeReady();
  assert.equal(ensureQueueReadyCalls, 0);

  await Promise.resolve();
  assert.equal(ensureQueueReadyCalls, 1);

  runtimeModule.ensureRuntimeReady();
  await Promise.resolve();
  assert.equal(ensureQueueReadyCalls, 1);

  delete globalThis.commerceStudioRuntimeStarted;
});
