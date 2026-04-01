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
      Date,
      Promise,
    },
    { filename: filePath },
  );

  return module.exports;
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

test("runtime header snapshot service returns cold snapshot immediately and starts background refresh", async () => {
  const modulePath = path.join(projectRoot, "lib", "server", "runtime", "header-snapshot-service.ts");
  const moduleExports = compileTsModule(modulePath, {
    "server-only": {},
    "./header-snapshot-store": {
      readRuntimeHeaderSummary() {
        return {
          totalJobs: 1,
          totalGenerated: 2,
          totalSucceeded: 3,
          totalFailed: 4,
        };
      },
      readRuntimeIntegrationSeed() {
        return {
          gemini: "partial",
          feishu: "inactive",
          lan: "ready",
        };
      },
      async probeRuntimeIntegrations() {
        return {
          gemini: "ready",
          feishu: "ready",
          lan: "ready",
        };
      },
    },
  });

  let now = 1000;
  let probeCalls = 0;
  const neverSettledProbe = new Promise(() => {});
  const service = moduleExports.createRuntimeHeaderSnapshotService({
    now: () => now,
    readSummary() {
      return {
        totalJobs: 10,
        totalGenerated: 20,
        totalSucceeded: 15,
        totalFailed: 5,
      };
    },
    readIntegrationSeed() {
      return {
        gemini: "partial",
        feishu: "partial",
        lan: "ready",
      };
    },
    probeIntegrations() {
      probeCalls += 1;
      return neverSettledProbe;
    },
  });

  const snapshot = service.getSnapshot();

  assert.equal(snapshot.stale, true);
  assert.equal(snapshot.integrations.gemini, "partial");
  assert.equal(snapshot.summary.totalJobs, 10);
  assert.equal(probeCalls, 0);

  now += 1;
  await flushMicrotasks();
  assert.equal(probeCalls, 1);
});

test("runtime header snapshot service returns stale value immediately and refreshes in background after TTL expiry", async () => {
  const modulePath = path.join(projectRoot, "lib", "server", "runtime", "header-snapshot-service.ts");
  const moduleExports = compileTsModule(modulePath, {
    "server-only": {},
    "./header-snapshot-store": {
      readRuntimeHeaderSummary() {
        return {
          totalJobs: 0,
          totalGenerated: 0,
          totalSucceeded: 0,
          totalFailed: 0,
        };
      },
      readRuntimeIntegrationSeed() {
        return {
          gemini: "inactive",
          feishu: "inactive",
          lan: "inactive",
        };
      },
      async probeRuntimeIntegrations() {
        return {
          gemini: "inactive",
          feishu: "inactive",
          lan: "inactive",
        };
      },
    },
  });

  let now = 5000;
  let probeCalls = 0;
  let secondProbeResolver = null;

  const service = moduleExports.createRuntimeHeaderSnapshotService({
    now: () => now,
    readSummary() {
      return {
        totalJobs: 8,
        totalGenerated: 12,
        totalSucceeded: 6,
        totalFailed: 2,
      };
    },
    readIntegrationSeed() {
      return {
        gemini: "partial",
        feishu: "partial",
        lan: "ready",
      };
    },
    probeIntegrations() {
      probeCalls += 1;
      if (probeCalls === 1) {
        return Promise.resolve({
          gemini: "ready",
          feishu: "ready",
          lan: "ready",
        });
      }

      return new Promise((resolve) => {
        secondProbeResolver = resolve;
      });
    },
  });

  service.getSnapshot();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await flushMicrotasks();
    if (!service.getSnapshot().stale) {
      break;
    }
  }

  now += 31_000;
  const staleSnapshot = service.getSnapshot();

  assert.equal(staleSnapshot.stale, true);
  assert.equal(staleSnapshot.integrations.gemini, "ready");
  assert.equal(probeCalls, 1);

  await flushMicrotasks();
  if (probeCalls === 1) {
    service.getSnapshot();
    await flushMicrotasks();
  }
  assert.equal(probeCalls, 2);

  secondProbeResolver?.({
    gemini: "ready",
    feishu: "ready",
    lan: "ready",
  });
  await flushMicrotasks();
});

test("runtime header snapshot service preserves previous successful integrations when refresh probe fails", async () => {
  const modulePath = path.join(projectRoot, "lib", "server", "runtime", "header-snapshot-service.ts");
  const moduleExports = compileTsModule(modulePath, {
    "server-only": {},
    "./header-snapshot-store": {
      readRuntimeHeaderSummary() {
        return {
          totalJobs: 0,
          totalGenerated: 0,
          totalSucceeded: 0,
          totalFailed: 0,
        };
      },
      readRuntimeIntegrationSeed() {
        return {
          gemini: "inactive",
          feishu: "inactive",
          lan: "inactive",
        };
      },
      async probeRuntimeIntegrations() {
        return {
          gemini: "inactive",
          feishu: "inactive",
          lan: "inactive",
        };
      },
    },
  });

  let now = 11_000;
  let probeCalls = 0;
  const service = moduleExports.createRuntimeHeaderSnapshotService({
    now: () => now,
    readSummary() {
      return {
        totalJobs: 4,
        totalGenerated: 7,
        totalSucceeded: 3,
        totalFailed: 1,
      };
    },
    readIntegrationSeed() {
      return {
        gemini: "partial",
        feishu: "partial",
        lan: "ready",
      };
    },
    probeIntegrations() {
      probeCalls += 1;
      if (probeCalls === 1) {
        return Promise.resolve({
          gemini: "ready",
          feishu: "ready",
          lan: "ready",
        });
      }

      return Promise.reject(new Error("probe failed"));
    },
  });

  service.getSnapshot();
  await flushMicrotasks();

  now += 31_000;
  const staleSnapshot = service.getSnapshot();
  assert.equal(staleSnapshot.integrations.gemini, "ready");
  assert.equal(staleSnapshot.stale, true);

  await flushMicrotasks();
  const snapshotAfterFailure = service.getSnapshot();
  assert.equal(snapshotAfterFailure.integrations.gemini, "ready");
});
