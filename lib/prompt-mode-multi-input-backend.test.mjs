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

  const sandbox = {
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
    Buffer,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(transpiled, sandbox, { filename: filePath });
  return module.exports;
}

const generationSemanticsStub = {
  normalizeGenerationSemantics(value) {
    return value === "joint" || value === "batch" ? value : "batch";
  },
  getRequestImageCount({ sourceImageCount = 0, referenceImageCount = 0 }) {
    return sourceImageCount + referenceImageCount;
  },
  getPlannedRequestCount({
    creationMode,
    generationSemantics,
    sourceImageCount = 0,
    typeCount,
    ratioCount,
    resolutionCount,
    variantsPerType,
  }) {
    const sourceGroups =
      creationMode === "prompt"
        ? 1
        : generationSemantics === "joint"
          ? Math.max(sourceImageCount, 1)
          : Math.max(sourceImageCount, 1);
    return sourceGroups * typeCount * ratioCount * resolutionCount * variantsPerType;
  },
};

const payloadModule = compileTsModule(path.join(projectRoot, "lib", "server", "generation", "payload.ts"), {
  "server-only": {},
  "@/lib/generation-semantics": generationSemanticsStub,
  "@/lib/image-model-limits": {
    getMaxImagesPerPromptForModel() {
      return 14;
    },
  },
});

let nextId = 1;
const jobBuilderModule = compileTsModule(path.join(projectRoot, "lib", "job-builder.ts"), {
  "server-only": {},
  "@/lib/generation-semantics": generationSemanticsStub,
  "@/lib/creative-fields": {
    buildCompositeSourceDescription({ sourceDescription, materialInfo, sizeInfo }) {
      return [sourceDescription, materialInfo, sizeInfo].filter(Boolean).join(" | ");
    },
  },
  "@/lib/server/generation/payload": payloadModule,
  "@/lib/utils": {
    createId(prefix) {
      const value = `${prefix}-${nextId}`;
      nextId += 1;
      return value;
    },
    dimensionsForVariant() {
      return { width: 1024, height: 1024 };
    },
    nowIso() {
      return "2026-03-20T00:00:00.000Z";
    },
  },
});

const { buildCreateJobInput } = jobBuilderModule;
const { validateCreatePayload } = payloadModule;

function readLib(fileName) {
  return fs.readFileSync(path.join(projectRoot, "lib", fileName), "utf8");
}

function makeSourceAsset(id, originalName) {
  return {
    id,
    jobId: "",
    jobItemId: null,
    kind: "source",
    originalName,
    mimeType: "image/png",
    filePath: `/tmp/${id}.png`,
    width: 1024,
    height: 1024,
    sizeBytes: 1024,
    sha256: `${id}-sha`,
    createdAt: "2026-03-20T00:00:00.000Z",
  };
}

function buildPromptPayload(overrides = {}) {
  return {
    creationMode: "prompt",
    generationSemantics: "batch",
    productName: "",
    sku: "",
    brandName: "Acme",
    category: "general",
    sellingPoints: "Fast and durable",
    restrictions: "",
    sourceDescription: "source notes",
    customPrompt: "legacy prompt",
    customNegativePrompt: "avoid blur",
    translatePromptToOutputLanguage: true,
    autoOptimizePrompt: true,
    country: "US",
    language: "en",
    platform: "amazon",
    selectedTypes: ["poster"],
    selectedRatios: ["1:1", "4:5"],
    selectedResolutions: ["1K", "2K"],
    variantsPerType: 3,
    includeCopyLayout: false,
    uiLanguage: "en",
    selectedTemplateOverrides: {},
    ...overrides,
  };
}

test("prompt mode expands by promptInputs x ratios x resolutions and does not fan out by variants/source images", () => {
  const sourceAssets = [makeSourceAsset("asset-1", "one.png"), makeSourceAsset("asset-2", "two.png")];
  const built = buildCreateJobInput(
    sourceAssets,
    buildPromptPayload({
      promptInputs: ["Prompt A", "Prompt B"],
    }),
    "job-prompt-multi",
  );

  assert.equal(built.creationMode, "prompt");
  assert.equal(built.generationSemantics, "joint");
  assert.deepEqual([...built.selectedTypes], ["scene"]);
  assert.deepEqual([...built.promptInputs], ["Prompt A", "Prompt B"]);
  assert.equal(built.items.length, 8);
  assert.ok(built.items.every((item) => item.variantIndex === 1));
  assert.ok(built.items.every((item) => item.imageType === "scene"));
  assert.equal(new Set(built.items.map((item) => item.sourceAssetId)).size, 1);

  const indexCounts = built.items.reduce((map, item) => {
    map.set(item.promptInputIndex, (map.get(item.promptInputIndex) ?? 0) + 1);
    return map;
  }, new Map());
  assert.deepEqual(
    [...indexCounts.entries()].sort((left, right) => left[0] - right[0]),
    [
      [0, 4],
      [1, 4],
    ],
  );
});

test("prompt mode falls back to legacy customPrompt when promptInputs is absent", () => {
  const built = buildCreateJobInput(
    [],
    buildPromptPayload({
      customPrompt: "legacy single prompt",
      promptInputs: undefined,
      selectedRatios: ["1:1"],
      selectedResolutions: ["1K"],
      variantsPerType: 5,
    }),
    "job-prompt-legacy",
  );

  assert.deepEqual([...built.promptInputs], ["legacy single prompt"]);
  assert.equal(built.items.length, 1);
  assert.ok(built.items.every((item) => item.promptInputIndex === 0));
});

test("prompt mode payload validation requires at least one non-empty prompt input and no longer relies on customPrompt", () => {
  assert.doesNotThrow(() =>
    validateCreatePayload(
      buildPromptPayload({
        customPrompt: "",
        customNegativePrompt: "",
        promptInputs: ["", "Cinematic hero product photo", "   "],
        selectedRatios: ["1:1"],
        selectedResolutions: ["1K"],
        variantsPerType: 1,
      }),
      {
        imageModel: "gemini-3.1-flash-image-preview",
        sourceFileCount: 0,
        referenceFileCount: 0,
      },
    ),
  );

  assert.throws(
    () =>
      validateCreatePayload(
        buildPromptPayload({
          customPrompt: "",
          customNegativePrompt: "",
          promptInputs: [" ", ""],
          selectedRatios: ["1:1"],
          selectedResolutions: ["1K"],
          variantsPerType: 1,
        }),
        {
          imageModel: "gemini-3.1-flash-image-preview",
          sourceFileCount: 0,
          referenceFileCount: 0,
        },
      ),
    /Prompt mode requires/,
  );
});

test("prompt mode payload validation counts every prompt input toward the total request cap", () => {
  const promptInputs = Array.from({ length: 97 }, (_, index) => `Prompt ${index + 1}`);

  assert.throws(
    () =>
      validateCreatePayload(
        buildPromptPayload({
          customPrompt: "",
          promptInputs,
          selectedRatios: ["1:1"],
          selectedResolutions: ["1K"],
          variantsPerType: 1,
        }),
        {
          imageModel: "gemini-3.1-flash-image-preview",
          sourceFileCount: 0,
          referenceFileCount: 0,
        },
      ),
    /too large|96 generated variants/i,
  );
});

test("prompt mode template builder keeps only positive prompt input", () => {
  const templatesContent = readLib("templates.ts");
  assert.doesNotMatch(templatesContent, /customNegativePrompt\?: string;/);
  assert.doesNotMatch(templatesContent, /Avoid these outcomes:/);
});
