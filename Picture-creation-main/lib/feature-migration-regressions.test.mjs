import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findProjectRoot(startDir) {
  let currentDir = startDir;

  for (;;) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
const standaloneChunkRoot = sourcePath(".next", "standalone", ".next", "server", "chunks");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sourcePath(...parts) {
  return path.join(projectRoot, ...parts);
}

function listFilesRecursively(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursively(entryPath);
    }

    return [entryPath];
  });
}

test("standard mode source uses staged JSON workflow and removes legacy standard template strategy layer", () => {
  const templatesContent = read(sourcePath("lib", "templates.ts"));
  const geminiContent = read(sourcePath("lib", "gemini.ts"));

  assert.match(geminiContent, /standard stage 1 analysis json/);
  assert.match(geminiContent, /mode must be standard\./);
  assert.match(
    geminiContent,
    /Top-level JSON keys must be exactly: mode, image_type, subject_analysis, reference_analysis, visual_plan, prompt_constraints\./,
  );
  assert.match(geminiContent, /standard stage 2 prompt conversion json/);
  assert.match(geminiContent, /Return JSON only with final_prompt and negative_constraints\./);
  assert.doesNotMatch(templatesContent, /standardSharedAnalysisLayer/);
  assert.doesNotMatch(templatesContent, /standardTypeStrategies/);
  assert.doesNotMatch(templatesContent, /buildStandardAnalysisLayer/);
});

test("suite mode source enforces a single source image and uses the two-stage JSON workflow", () => {
  const payloadContent = read(sourcePath("lib", "server", "generation", "payload.ts"));
  const geminiContent = read(sourcePath("lib", "gemini.ts"));

  assert.match(payloadContent, /Suite mode only supports 1 source image\./);
  assert.match(payloadContent, /selectedTypes:\s*\["main-image",\s*"lifestyle",\s*"feature-overview",\s*"scene",\s*"material-craft",\s*"size-spec"\]/);
  assert.match(geminiContent, /suite stage 1 set analysis json/);
  assert.match(geminiContent, /mode must be set\./);
  assert.match(geminiContent, /Top-level JSON keys must be exactly: mode, subject_analysis, set_plan\./);
  assert.match(geminiContent, /suite per-image planning json/);
  assert.match(geminiContent, /suite per-image prompt conversion json/);
  assert.doesNotMatch(geminiContent, /suiteTypeRules/);
  assert.doesNotMatch(geminiContent, /suite shared product analysis json/);
  assert.doesNotMatch(geminiContent, /suite type-specific prompt conversion/);
  assert.match(geminiContent, /Suite workflow fallback:/);
});

test("amazon a plus source enforces a single source image and uses the dedicated two-stage workflow", () => {
  const payloadContent = read(sourcePath("lib", "server", "generation", "payload.ts"));
  const geminiContent = read(sourcePath("lib", "gemini.ts"));

  assert.match(payloadContent, /Amazon A\+ mode only supports 1 source image\./);
  assert.match(payloadContent, /selectedTypes:\s*\["poster",\s*"feature-overview",\s*"multi-scene",\s*"detail",\s*"size-spec",\s*"culture-value"\]/);
  assert.match(geminiContent, /amazon stage 1 analysis json/);
  assert.match(geminiContent, /mode must be amazon\./);
  assert.match(geminiContent, /Top-level JSON keys must be exactly: mode, product_analysis, amazon_plan\./);
  assert.match(geminiContent, /amazon per-module planning json/);
  assert.match(geminiContent, /amazon per-module prompt conversion json/);
  assert.doesNotMatch(geminiContent, /amazonAPlusTypeRules/);
  assert.doesNotMatch(geminiContent, /amazon a\+ shared product analysis json/);
  assert.doesNotMatch(geminiContent, /amazon a\+ type-specific prompt conversion/);
  assert.match(geminiContent, /Amazon A\+ workflow fallback:/);
});

test("reference remix source enforces 1+1 inputs and routes through the Chinese JSON workflow", () => {
  const payloadContent = read(sourcePath("lib", "server", "generation", "payload.ts"));
  const geminiContent = read(sourcePath("lib", "gemini.ts"));
  const processJobContent = read(sourcePath("lib", "server", "generation", "process-job.ts"));
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));
  const detailsContent = read(sourcePath("components", "job-details-client.tsx"));
  const templatesContent = read(sourcePath("lib", "templates.ts"));

  assert.match(payloadContent, /Reference remix mode requires exactly 1 source image\./);
  assert.match(payloadContent, /Reference remix mode requires exactly 1 reference image\./);
  assert.match(payloadContent, /Reference remix mode only supports 1 source image \+ 1 reference image\./);
  assert.match(geminiContent, /reference remix source\/reference analysis json/);
  assert.match(geminiContent, /reference remix chinese prompt conversion/);
  assert.match(geminiContent, /buildReferenceRemixStage1AnalysisPrompt/);
  assert.match(geminiContent, /buildReferenceRemixStage2PromptConversionPrompt/);
  assert.match(geminiContent, /buildReferenceRemixFallbackOptimizedPrompt/);
  assert.match(geminiContent, /Reference image is the primary blueprint for composition, shot distance, pose\/action, clothing silhouette\/color blocking, background structure, prop relationships, lighting, and mood\./);
  assert.match(geminiContent, /Reference-first execution is mandatory\./);
  assert.doesNotMatch(geminiContent, /Principles: subject first, layered replication, adaptation first, no plagiarism or direct copying\./);
  assert.match(geminiContent, /The final prompt must be Chinese\./);
  assert.match(geminiContent, /The negativePrompt must be Chinese\./);
  assert.match(geminiContent, /Reference remix workflow fallback:/);
  assert.match(processJobContent, /referenceImages,/);
  assert.match(processJobContent, /Reference remix generation failed:/);
  assert.match(uiContent, /referenceRemakeGoal: undefined,/);
  assert.match(uiContent, /referenceStrength: undefined,/);
  assert.match(uiContent, /referenceCompositionLock: undefined,/);
  assert.match(uiContent, /referenceTextRegionPolicy: undefined,/);
  assert.match(uiContent, /referenceBackgroundMode: undefined,/);
  assert.match(uiContent, /preserveReferenceText: undefined,/);
  assert.match(uiContent, /referenceCopyMode: undefined,/);
  assert.match(uiContent, /referenceExtraPrompt: undefined,/);
  assert.match(uiContent, /referenceNegativePrompt: undefined,/);
  assert.doesNotMatch(uiContent, /referenceCopyModeReferenceHint/);
  assert.doesNotMatch(uiContent, /referenceCopyModeCopySheetHint/);
  assert.doesNotMatch(uiContent, /remakeSimplifiedHint/);
  assert.doesNotMatch(uiContent, /showLegacyReferenceControls/);
  assert.doesNotMatch(detailsContent, /referenceCopyMode/);
  assert.doesNotMatch(detailsContent, /referenceCopyModeReference/);
  assert.doesNotMatch(detailsContent, /referenceCopyModeCopySheet/);
  assert.doesNotMatch(templatesContent, /buildReferenceDirectRemakePrompt/);
  assert.doesNotMatch(templatesContent, /buildReferenceTaskSpec/);
  assert.doesNotMatch(templatesContent, /remakeGoalPrompt/);
  assert.doesNotMatch(templatesContent, /compositionLockPrompt/);
  assert.doesNotMatch(templatesContent, /textRegionPolicyPrompt/);
});

test("gemini source uses a static templates import so standalone output cannot reference the source file at runtime", () => {
  const content = read(sourcePath("lib", "gemini.ts"));
  const templatesContent = read(sourcePath("lib", "templates.ts"));
  const constantsContent = read(sourcePath("lib", "constants.ts"));

  assert.match(content, /from "\.\/templates\.ts"/);
  assert.doesNotMatch(content, /eval\)\('import\("\.\/templates\.ts"\)'\)/);
  assert.doesNotMatch(content, /loadTemplatesModule/);
  assert.match(templatesContent, /from "\.\/constants\.ts"/);
  assert.doesNotMatch(templatesContent, /@\/lib\/constants/);
  assert.match(constantsContent, /from "\.\/types\.ts"/);
  assert.doesNotMatch(constantsContent, /@\/lib\/types/);

  if (fs.existsSync(standaloneChunkRoot)) {
    const standaloneChunkFiles = listFilesRecursively(standaloneChunkRoot).filter((filePath) => /\.(?:c|m)?js$/i.test(filePath));
    assert.ok(standaloneChunkFiles.length > 0, `Expected standalone chunk files in ${standaloneChunkRoot}`);

    const offendingFiles = standaloneChunkFiles.filter((filePath) => read(filePath).includes("templates.ts"));
    assert.deepEqual(
      offendingFiles,
      [],
      `Standalone chunk output still references templates.ts: ${offendingFiles.join(", ")}`,
    );
  }
});

test("create-job-form uses Chinese labels in zh mode and does not contain mojibake markers", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));

  assert.match(uiContent, /standardMode:\s*"标准模式"/);
  assert.match(uiContent, /promptMode:\s*"提示词模式"/);
  assert.match(uiContent, /referenceMode:\s*"参考图复刻"/);
  assert.match(uiContent, /sourceImages:\s*"图片原图"/);
  assert.match(uiContent, /chooseFiles:\s*"选择文件"/);
  assert.match(uiContent, /imageTypes:\s*"图片类型"/);
  assert.match(uiContent, /ratios:\s*"比例"/);
  assert.match(uiContent, /resolutions:\s*"分辨率"/);
  assert.match(uiContent, /submit:\s*"提交任务"/);
  assert.match(uiContent, /suiteModeLabel\s*=\s*language === "zh" \? "套图模式"/);
  assert.match(uiContent, /amazonAPlusModeLabel\s*=\s*language === "zh" \? "亚马逊 A\+"/);
  assert.match(uiContent, /仅支持 1 张原图 \+ 1 张参考图，然后执行两阶段 JSON -> 中文提示词工作流。/);

  assert.doesNotMatch(uiContent, /鏂瑰舰/);
  assert.doesNotMatch(uiContent, /闀跨珫/);
  assert.doesNotMatch(uiContent, /瓒呯珫/);
  assert.doesNotMatch(uiContent, /妯浘/);
  assert.doesNotMatch(uiContent, /绔栧浘/);
  assert.doesNotMatch(uiContent, /瀹藉睆/);
  assert.doesNotMatch(uiContent, /鐢靛奖/);
  assert.doesNotMatch(uiContent, /鍟嗗搧鍚嶏紙鍙€夛級/);
  assert.doesNotMatch(uiContent, /鍗栫偣锛堝彲閫夛級/);
  assert.doesNotMatch(uiContent, /琛ュ厖璇存槑锛堝彲閫夛級/);
  assert.doesNotMatch(uiContent, /璇峰厛濉啓鍥剧墖鍚嶃€?/);
  assert.doesNotMatch(uiContent, /姣忎釜妯″潡鐢熸垚鏁伴噺/);
});

test("workflow orchestration persists negative prompts and warnings for migrated modes", () => {
  const processJobContent = read(sourcePath("lib", "server", "generation", "process-job.ts"));

  assert.match(
    processJobContent,
    /job\.creationMode === "standard"[\s\S]*job\.creationMode === "suite"[\s\S]*job\.creationMode === "amazon-a-plus"[\s\S]*job\.creationMode === "reference-remix"/,
  );
  assert.match(processJobContent, /negativePrompt: copy\?\.negativePrompt/);
  assert.match(processJobContent, /warningMessage: \[dimensionWarning, workflowWarning\]/);
  assert.match(processJobContent, /generateModeWorkflowCopyBundle/);
  assert.match(processJobContent, /generateSharedModeAnalysis/);
});

test("release packaging launcher reuses the standalone helper and auto-selects a free port", () => {
  const content = read(sourcePath("scripts", "package-release.ps1"));

  assert.match(content, /start-project-standalone\.ps1/);
  assert.match(content, /for %%P in \(3000 3001 3002 3003 3004 3005\)/);
  assert.match(content, /No free port found in 3000-3005\./);
  assert.match(content, /The launcher automatically picks a free port from 3000-3005/);
  assert.ok(!content.includes('"%NODE_EXE%" server.js'), "package-release should not directly launch server.js anymore");
});
