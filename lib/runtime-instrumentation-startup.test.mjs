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

test("instrumentation register boots runtime on nodejs runtime only", async () => {
  const instrumentationPath = path.join(projectRoot, "instrumentation.ts");
  assert.equal(fs.existsSync(instrumentationPath), true);

  let ensureRuntimeReadyCalls = 0;
  const instrumentationModule = compileTsModule(instrumentationPath, {
    "@/lib/runtime": {
      ensureRuntimeReady: () => {
        ensureRuntimeReadyCalls += 1;
      },
    },
  });

  const previousNextRuntime = process.env.NEXT_RUNTIME;

  process.env.NEXT_RUNTIME = "nodejs";
  await instrumentationModule.register();
  assert.equal(ensureRuntimeReadyCalls, 1);

  process.env.NEXT_RUNTIME = "edge";
  await instrumentationModule.register();
  assert.equal(ensureRuntimeReadyCalls, 1);

  if (typeof previousNextRuntime === "undefined") {
    delete process.env.NEXT_RUNTIME;
  } else {
    process.env.NEXT_RUNTIME = previousNextRuntime;
  }
});
