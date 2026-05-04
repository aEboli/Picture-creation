import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

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

  const sandbox = {
    module,
    exports: module.exports,
    require: (specifier) => {
      if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
        return stubs[specifier];
      }
      if (specifier.startsWith("node:")) {
        return require(specifier);
      }
      throw new Error(`Missing stub for import "${specifier}" while evaluating ${filePath}`);
    },
    __filename: filePath,
    __dirname: path.dirname(filePath),
    console,
    process,
    Buffer,
  };

  vm.runInNewContext(transpiled, sandbox, { filename: filePath });
  return module.exports;
}

test("writeFileAsset stores files under selected directory plus YYMMDD folder", async () => {
  const selectedDir = path.join(projectRoot, "tmp-output");
  const mkdirCalls = [];
  const writeFileCalls = [];
  const storageModule = compileTsModule(path.join(projectRoot, "lib", "storage.ts"), {
    "node:fs/promises": {
      access: async () => undefined,
      mkdir: async (dirPath, options) => {
        mkdirCalls.push({ dirPath, options });
      },
      readFile: async () => Buffer.from(""),
      writeFile: async (filePath, buffer) => {
        writeFileCalls.push({ filePath, buffer });
      },
    },
    "@/lib/server/settings/store": {
      getSettingsSnapshot() {
        return { storageDir: selectedDir };
      },
    },
    "@/lib/utils": {
      createId() {
        return "asset_fixed";
      },
      detectImageDimensions() {
        return { width: 1, height: 1 };
      },
      mimeToExtension() {
        return "png";
      },
      nowIso() {
        return "2026-05-03T08:12:00.000Z";
      },
      sha256() {
        return "sha";
      },
    },
  });

  const asset = await storageModule.writeFileAsset({
    jobId: "job_1",
    kind: "source",
    originalName: "source.png",
    mimeType: "image/png",
    buffer: Buffer.from("image"),
  });

  const expectedDir = path.join(selectedDir, "260503");
  const expectedFilePath = path.join(expectedDir, "asset_fixed.png");
  assert.equal(asset.filePath, expectedFilePath);
  assert.deepEqual(
    mkdirCalls.map((call) => call.dirPath),
    [selectedDir, expectedDir],
  );
  assert.equal(writeFileCalls[0].filePath, expectedFilePath);
});
