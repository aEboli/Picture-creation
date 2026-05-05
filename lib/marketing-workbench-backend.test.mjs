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
    Blob,
    File,
    FormData,
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
  inferGenerationSemanticsFromSourceCount(sourceImageCount) {
    return sourceImageCount > 1 ? "joint" : "batch";
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
    dimensionsForVariant(ratio) {
      return ratio === "4:5" ? { width: 1024, height: 1280 } : { width: 1024, height: 1024 };
    },
    nowIso() {
      return "2026-03-26T00:00:00.000Z";
    },
  },
});

const { buildCreateJobInput } = jobBuilderModule;
const { validateCreatePayload, normalizeCreatePayload } = payloadModule;

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
    createdAt: "2026-03-26T00:00:00.000Z",
  };
}

function buildStructuredPayload(overrides = {}) {
  return {
    creationMode: "suite",
    generationSemantics: "joint",
    strategyWorkflowMode: "quick",
    productName: "Fishing lure",
    sku: "",
    brandName: "Acme",
    category: "general",
    sellingPoints: "Strong hook, realistic finish",
    restrictions: "",
    sourceDescription: "",
    materialInfo: "ABS body, metal hooks",
    sizeInfo: "10cm",
    customPrompt: "",
    promptInputs: undefined,
    customNegativePrompt: "",
    translatePromptToOutputLanguage: false,
    autoOptimizePrompt: false,
    country: "CN",
    language: "zh-CN",
    platform: "amazon",
    selectedTypes: ["main-image", "feature-overview", "detail", "scene", "size-spec"],
    selectedRatios: ["4:5", "1:1"],
    selectedResolutions: ["1K", "2K"],
    variantsPerType: 2,
    includeCopyLayout: false,
    uiLanguage: "zh",
    selectedTemplateOverrides: {},
    marketingStrategy: undefined,
    imageStrategies: undefined,
    ...overrides,
  };
}

test("structured commerce payload normalization keeps only the first ratio and resolution", () => {
  const normalized = normalizeCreatePayload(
    buildStructuredPayload({
      creationMode: "amazon-a-plus",
      selectedRatios: ["4:5", "1:1"],
      selectedResolutions: ["2K", "4K"],
    }),
  );

  assert.deepEqual([...normalized.selectedRatios], ["4:5"]);
  assert.deepEqual([...normalized.selectedResolutions], ["2K"]);
});

test("structured commerce request count uses type count × group count only", () => {
  const normalized = normalizeCreatePayload(
    buildStructuredPayload({
      creationMode: "suite",
      selectedTypes: ["main-image", "feature-overview", "detail", "scene", "material-craft"],
      selectedRatios: ["4:5", "1:1"],
      selectedResolutions: ["1K", "2K"],
      variantsPerType: 2,
      sizeInfo: "",
    }),
  );

  const createInput = buildCreateJobInput([makeSourceAsset("asset-1", "one.png")], normalized, "job-structured-suite");

  assert.deepEqual([...createInput.selectedRatios], ["4:5"]);
  assert.deepEqual([...createInput.selectedResolutions], ["1K"]);
  assert.equal(createInput.items.length, 10);
});

test("size-spec is auto-included for structured modes when size info is filled", () => {
  const normalized = normalizeCreatePayload(
    buildStructuredPayload({
      creationMode: "suite",
      selectedTypes: ["scene", "detail"],
      sizeInfo: "2.54cm x 5.08cm",
    }),
  );

  const createInput = buildCreateJobInput([makeSourceAsset("asset-size", "size.png")], normalized, "job-size-auto");

  assert.ok(createInput.selectedTypes.includes("size-spec"));
  assert.ok(createInput.items.some((item) => item.imageType === "size-spec"));
});

test("size-spec stays absent when size info is empty", () => {
  const normalized = normalizeCreatePayload(
    buildStructuredPayload({
      creationMode: "suite",
      selectedTypes: ["scene", "detail", "size-spec"],
      sizeInfo: "",
    }),
  );

  const createInput = buildCreateJobInput([makeSourceAsset("asset-no-size", "nosize.png")], normalized, "job-size-none");

  assert.ok(!createInput.selectedTypes.includes("size-spec"));
  assert.ok(!createInput.items.some((item) => item.imageType === "size-spec"));
});

test("structured modes validate against selected image types instead of imageStrategies", () => {
  assert.doesNotThrow(() =>
    validateCreatePayload(
      buildStructuredPayload({
        creationMode: "standard",
        selectedTypes: ["scene", "detail", "poster"],
        variantsPerType: 2,
        imageStrategies: undefined,
      }),
      {
        imageModel: "gemini-3.1-flash-image-preview",
        sourceFileCount: 1,
        referenceFileCount: 0,
      },
    ),
  );
});

test("quick structured job creation no longer synthesizes marketingStrategy or imageStrategies before enqueue", async () => {
  let capturedEffectivePayload = null;

  const createJobModule = compileTsModule(path.join(projectRoot, "lib", "server", "generation", "create-job.ts"), {
    "server-only": {},
    "@/lib/db": {
      getSettings() {
        return {
          defaultApiKey: "test-key",
          defaultImageModel: "gemini-3.1-flash-image-preview",
        };
      },
    },
    "@/lib/job-builder": {
      buildCreateJobInput(sourceAssets, payload, jobId) {
        capturedEffectivePayload = payload;
        return { id: jobId, sourceAssets };
      },
    },
    "@/lib/generation-semantics": generationSemanticsStub,
    "@/lib/server/jobs/lifecycle": {
      createAndEnqueueJob({ createInput }) {
        return { id: createInput.id };
      },
    },
    "@/lib/storage": {
      async writeFileAsset({ jobId, kind, originalName, mimeType, buffer }) {
        return {
          id: `${kind}-${originalName}`,
          jobId,
          jobItemId: null,
          kind,
          originalName,
          mimeType,
          filePath: `/tmp/${originalName}`,
          width: 1024,
          height: 1024,
          sizeBytes: buffer.length,
          sha256: `${originalName}-sha`,
          createdAt: "2026-03-26T00:00:00.000Z",
        };
      },
    },
    "@/lib/utils": {
      createId() {
        return "job-structured-suite";
      },
    },
    "./payload": payloadModule,
  });

  const { createGenerationJobFromFormData } = createJobModule;
  const formData = new FormData();
  formData.append("payload", JSON.stringify(buildStructuredPayload()));
  formData.append("files", new File(["source"], "source.png", { type: "image/png" }));

  const result = await createGenerationJobFromFormData(formData);

  assert.equal(result.jobId, "job-structured-suite");
  assert.equal(capturedEffectivePayload?.marketingStrategy, undefined);
  assert.equal(capturedEffectivePayload?.imageStrategies, undefined);
});
