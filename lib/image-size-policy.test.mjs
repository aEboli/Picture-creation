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
    },
    { filename: filePath },
  );

  return module.exports;
}

const imageSizePolicy = compileTsModule(path.join(projectRoot, "lib", "image-size-policy.ts"), {
  "@/lib/types": {},
  "@/lib/utils": {
    parseRatio(value) {
      const [left, right] = value.split(":").map(Number);
      return [left || 1, right || 1];
    },
    resolutionToPixels(label) {
      if (label === "512px" || label === "0.5K") return 512;
      if (label === "1K") return 1024;
      if (label === "2K") return 2048;
      if (label === "4K") return 4096;
      return 1024;
    },
    isGeminiImageSizeBucket(label) {
      return ["0.5K", "512px", "1K", "2K", "4K"].includes(label);
    },
  },
});

test("requested bucket display includes concrete dimensions when available", () => {
  assert.equal(
    imageSizePolicy.formatRequestedSizeDisplay({
      width: 1024,
      height: 1024,
      resolutionLabel: "1K",
      language: "zh",
      emptyLabel: "未知",
    }),
    "1K 档位 (1024x1024)",
  );
  assert.equal(
    imageSizePolicy.formatRequestedSizeDisplay({
      width: 1536,
      height: 1024,
      resolutionLabel: "1K",
      language: "en",
      emptyLabel: "Unknown",
    }),
    "1K bucket (1536x1024)",
  );
});

test("requested bucket display keeps the old fallback when dimensions are missing", () => {
  assert.equal(
    imageSizePolicy.formatRequestedSizeDisplay({
      width: null,
      height: null,
      resolutionLabel: "1K",
      language: "zh",
      emptyLabel: "未知",
    }),
    "1K 档位",
  );
});

test("1K bucket matching requires the shortest returned side to reach 1024", () => {
  assert.equal(
    imageSizePolicy.meetsRequestedResolutionBucket({
      requestedResolutionLabel: "1K",
      actualWidth: 819,
      actualHeight: 1024,
    }),
    false,
  );
  assert.equal(
    imageSizePolicy.meetsRequestedResolutionBucket({
      requestedResolutionLabel: "1K",
      actualWidth: 1024,
      actualHeight: 1280,
    }),
    true,
  );
});
