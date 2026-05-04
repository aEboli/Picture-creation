import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readProjectFile(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

function compileTsModule(filePath, stubs, options = {}) {
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
      Buffer,
      TextDecoder,
      fetch: options.fetch ?? fetch,
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

function compileOpenAiProvider(options = {}) {
  return compileTsModule(path.join(projectRoot, "lib", "openai-provider.ts"), {
  "./prompt-quality-enhancements.ts": {
    appendQualityEnhancements(value) {
      return value;
    },
  },
  "./templates.ts": {},
  "./types.ts": {},
  "./gemini": {
    buildStandardStage1AnalysisPrompt() {
      return "";
    },
    buildStandardStage2PromptConversionPrompt() {
      return "";
    },
    buildReferenceRemixStage1AnalysisPrompt() {
      return "";
    },
    buildReferenceRemixStage2PromptConversionPrompt() {
      return "";
    },
    buildSetStage1AnalysisPrompt() {
      return "";
    },
    buildSetPerImagePromptConversionPrompt() {
      return "";
    },
    buildAmazonStage1AnalysisPrompt() {
      return "";
    },
    buildAmazonPerModulePromptConversionPrompt() {
      return "";
    },
    resolveImageGenerationPromptText() {
      return "";
    },
    parseCopyBundleResponse() {
      return {};
    },
    parseModelJsonResponse() {
      return {};
    },
    normalizeProviderError(error) {
      return error instanceof Error ? error.message : String(error);
    },
    getSharedModeAnalysisTemperature() {
      return 1;
    },
    getModeWorkflowCopyTemperature() {
      return 1;
    },
    getImageGenerationTemperature() {
      return 1;
    },
    sanitizeWorkflowOptimizedPrompt(value) {
      return value;
    },
  },
  }, options);
}

const openAiProvider = compileOpenAiProvider();

test("OpenAI provider resolves API roots to the Responses endpoint", () => {
  assert.equal(openAiProvider.resolveOpenAIResponsesUrl(), "https://api.openai.com/v1/responses");
  assert.equal(openAiProvider.resolveOpenAIResponsesUrl("https://api.asxs.top/v1"), "https://api.asxs.top/v1/responses");
  assert.equal(
    openAiProvider.resolveOpenAIResponsesUrl("https://api.asxs.top/v1/"),
    "https://api.asxs.top/v1/responses",
  );
  assert.equal(
    openAiProvider.resolveOpenAIResponsesUrl("https://api.asxs.top/v1/responses"),
    "https://api.asxs.top/v1/responses",
  );
  assert.equal(
    openAiProvider.resolveOpenAIResponsesUrl("https://api.asxs.top/custom/responses"),
    "https://api.asxs.top/custom/responses",
  );
});

test("OpenAI image generation uses the text model as the outer Responses model", () => {
  const content = readProjectFile("lib", "server", "generation", "process-job.ts");

  assert.match(
    content,
    /imageModel:\s*providerType === "openai"\s*\?\s*textModel\s*:\s*imageModel/,
  );
});

test("OpenAI image tool size follows requested variant dimensions and API constraints", () => {
  assert.equal(openAiProvider.resolveOpenAIImageToolSize({ width: 1024, height: 1024 }), "1024x1024");
  assert.equal(openAiProvider.resolveOpenAIImageToolSize({ width: 819, height: 1024 }), "1024x1536");
  assert.equal(openAiProvider.resolveOpenAIImageToolSize({ width: 4096, height: 4096 }), "1024x1024");
  assert.equal(openAiProvider.resolveOpenAIImageToolSize({ width: 4096, height: 2304 }), "1536x1024");
  assert.equal(openAiProvider.resolveOpenAIImageToolSize({ width: 512, height: 512 }), "1024x1024");
  assert.equal(openAiProvider.resolveOpenAIImageToolSize({ width: null, height: 512 }), undefined);
});

test("OpenAI structured feature analysis is routed through the OpenAI provider", () => {
  const provider = readProjectFile("lib", "openai-provider.ts");
  const processJob = readProjectFile("lib", "server", "generation", "process-job.ts");

  assert.match(provider, /export async function analyzeProductImageFeatures/);
  assert.match(processJob, /providerType === "openai"[\s\S]{0,240}m\.analyzeProductImageFeatures/);
});

test("OpenAI image generation sends size and forces generate action on the image tool", async () => {
  const imageBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
  const ssePayload = [
    "data: " +
      JSON.stringify({
        type: "response.output_item.done",
        item: {
          type: "image_generation_call",
          result: imageBase64,
        },
      }),
    "",
    "",
  ].join("\n");
  const sseBytes = new TextEncoder().encode(ssePayload);
  let capturedPayload = null;
  const provider = compileOpenAiProvider({
    fetch: async (_url, init) => {
      capturedPayload = JSON.parse(init.body);
      let sent = false;
      return {
        ok: true,
        body: {
          getReader() {
            return {
              async read() {
                if (sent) {
                  return { done: true };
                }
                sent = true;
                return { done: false, value: sseBytes };
              },
            };
          },
        },
      };
    },
  });

  await provider.generateOpenAIImage({
    apiKey: "test-key",
    imageModel: "gpt-5.5",
    prompt: "Draw a square product photo.",
    size: "1024x1024",
  });

  assert.equal(capturedPayload.tools[0].type, "image_generation");
  assert.equal(capturedPayload.tools[0].model, "gpt-image-2");
  assert.equal(capturedPayload.tools[0].size, "1024x1024");
  assert.equal(capturedPayload.tools[0].action, "generate");
  assert.equal("tool_choice" in capturedPayload, false);
});
