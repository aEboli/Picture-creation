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

test("ensureQueueReady schedules queue recovery asynchronously", async () => {
  let recoverQueueJobIdsCalls = 0;
  const queuePath = path.join(projectRoot, "lib", "queue.ts");
  const queueModule = compileTsModule(queuePath, {
    "server-only": {},
    "@/lib/server/generation/process-job": {
      processJob: async () => undefined,
    },
    "@/lib/server/jobs/recovery": {
      recoverQueueJobIds: () => {
        recoverQueueJobIdsCalls += 1;
        return [];
      },
    },
    "@/lib/server/settings/store": {
      getSettingsSnapshot: () => ({ maxConcurrency: 1 }),
    },
    "@/lib/types": {},
  });

  delete globalThis.commerceStudioQueue;

  queueModule.ensureQueueReady();
  assert.equal(recoverQueueJobIdsCalls, 0);

  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recoverQueueJobIdsCalls, 1);

  delete globalThis.commerceStudioQueue;
});
