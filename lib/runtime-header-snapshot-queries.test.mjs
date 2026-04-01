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
      URLSearchParams,
      setTimeout,
      clearTimeout,
      Date,
    },
    { filename: filePath },
  );

  return module.exports;
}

test("workspace queries read integrations and header summary from runtime snapshot service", async () => {
  const queriesPath = path.join(projectRoot, "lib", "server", "workspace", "queries.ts");
  let runtimeSnapshotCalls = 0;
  let summarizeCalls = 0;
  let settingsReads = 0;

  const runtimeSnapshot = {
    integrations: {
      gemini: "ready",
      feishu: "partial",
      lan: "ready",
    },
    summary: {
      totalJobs: 6,
      totalGenerated: 16,
      totalSucceeded: 5,
      totalFailed: 1,
    },
    refreshedAt: "2026-03-30T00:00:00.000Z",
    stale: false,
  };

  const moduleExports = compileTsModule(queriesPath, {
    "server-only": {},
    react: {
      cache(fn) {
        return fn;
      },
    },
    "node:os": {
      networkInterfaces() {
        return {};
      },
    },
    "@/lib/feishu": {
      testFeishuConnection() {
        throw new Error("getHomePageData should not run direct Feishu probes.");
      },
    },
    "@/lib/gemini": {
      testProviderConnection() {
        throw new Error("getHomePageData should not run direct provider probes.");
      },
    },
    "./store": {
      getDashboardStatsSnapshot() {
        return {
          jobs: 99,
          assets: 88,
          markets: 77,
        };
      },
      getSettingsSnapshot() {
        settingsReads += 1;
        throw new Error("getSettingsSnapshot should not be used in homepage read path.");
      },
      listBrandsSnapshot() {
        return [];
      },
      listHistoryJobsByFilters() {
        return [];
      },
      summarizeHistoryJobsByFilters() {
        summarizeCalls += 1;
        throw new Error("history summary should come from runtime header snapshot");
      },
    },
    "@/lib/server/runtime/header-snapshot-service": {
      getRuntimeHeaderSnapshot() {
        runtimeSnapshotCalls += 1;
        return runtimeSnapshot;
      },
    },
  });

  const homeData = await moduleExports.getHomePageData();
  assert.equal(homeData.integrations.gemini, "ready");
  assert.equal(homeData.stats.jobs, 99);

  const headerSummary = moduleExports.getHistoryHeaderSummary();
  assert.equal(headerSummary.totalGenerated, 16);

  assert.equal(settingsReads, 0);
  assert.equal(summarizeCalls, 0);
  assert.ok(runtimeSnapshotCalls >= 2);
});
