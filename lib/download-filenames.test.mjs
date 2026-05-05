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
    },
    { filename: filePath },
  );

  return module.exports;
}

const helperPath = path.join(projectRoot, "lib", "download-filenames.ts");
const helperStubs = {
  "@/lib/constants": {
    IMAGE_TYPE_OPTIONS: [
      { value: "scene", label: { zh: "场景图", en: "Lifestyle scene" } },
      { value: "detail", label: { zh: "细节图", en: "Detail image" } },
    ],
  },
};

test("buildGeneratedImageDownloadName uses source image name + type + resolution + ratio", () => {
  const { buildGeneratedImageDownloadName } = compileTsModule(helperPath, helperStubs);

  const filename = buildGeneratedImageDownloadName({
    sourceAssetName: "电动四节鱼饵.png",
    imageType: "scene",
    creationMode: "standard",
    resolutionLabel: "4K",
    ratio: "1:1",
    mimeType: "image/png",
    language: "zh",
  });

  assert.equal(filename, "电动四节鱼饵-场景图-4K-1x1.png");
});

test("buildGeneratedImageDownloadName keeps reference-remix type readable and infers extension from mime", () => {
  const { buildGeneratedImageDownloadName } = compileTsModule(helperPath, helperStubs);

  const filename = buildGeneratedImageDownloadName({
    sourceAssetName: "source-without-extension",
    imageType: "scene",
    creationMode: "reference-remix",
    resolutionLabel: "2K",
    ratio: "4:5",
    mimeType: "image/jpeg",
    language: "zh",
  });

  assert.equal(filename, "source-without-extension-复刻图-2K-4x5.jpg");
});

test("dedupeDownloadFilenames appends numeric suffixes for collisions", () => {
  const { dedupeDownloadFilenames } = compileTsModule(helperPath, helperStubs);

  const names = dedupeDownloadFilenames([
    "电动四节鱼饵-场景图-4K-1x1.png",
    "电动四节鱼饵-场景图-4K-1x1.png",
    "电动四节鱼饵-场景图-4K-1x1.png",
  ]);

  assert.deepEqual([...names], [
    "电动四节鱼饵-场景图-4K-1x1.png",
    "电动四节鱼饵-场景图-4K-1x1_02.png",
    "电动四节鱼饵-场景图-4K-1x1_03.png",
  ]);
});

test("buildAllImagesZipName prefers the first source image name", () => {
  const { buildAllImagesZipName } = compileTsModule(helperPath, helperStubs);

  const zipName = buildAllImagesZipName(["第一张原图.png", "第二张原图.png"]);

  assert.equal(zipName, "第一张原图-all-images.zip");
});
