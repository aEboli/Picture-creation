import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
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

        return nodeRequire(specifier);
      },
      __filename: filePath,
      __dirname: path.dirname(filePath),
      console,
      process,
      setTimeout,
      clearTimeout,
    },
    { filename: filePath },
  );

  return module.exports;
}

test("runtime header snapshot route returns current snapshot payload from service", async () => {
  const routePath = path.join(projectRoot, "app", "api", "runtime", "header-snapshot", "route.ts");
  let serviceCalls = 0;

  const moduleExports = compileTsModule(routePath, {
    "next/server": {
      NextResponse: {
        json(body, init) {
          return {
            body,
            status: init?.status ?? 200,
          };
        },
      },
    },
    "@/lib/server/runtime/header-snapshot-service": {
      getRuntimeHeaderSnapshot() {
        serviceCalls += 1;
        return {
          integrations: {
            gemini: "ready",
            feishu: "partial",
            lan: "ready",
          },
          summary: {
            totalJobs: 10,
            totalGenerated: 30,
            totalSucceeded: 8,
            totalFailed: 2,
          },
          refreshedAt: "2026-03-30T00:00:00.000Z",
          stale: true,
        };
      },
    },
  });

  const response = await moduleExports.GET();
  assert.equal(response.status, 200);
  assert.equal(serviceCalls, 1);
  assert.equal(response.body.stale, true);
  assert.equal(response.body.integrations.feishu, "partial");
});
