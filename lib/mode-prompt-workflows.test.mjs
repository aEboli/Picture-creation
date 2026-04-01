import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAmazonPerModulePlan,
  buildAmazonPerModulePromptConversionPrompt,
  buildAmazonStage1AnalysisPrompt,
  buildSetPerImagePlan,
  buildSetPerImagePromptConversionPrompt,
  buildSetStage1AnalysisPrompt,
  buildStandardStage1AnalysisPrompt,
  buildStandardStage2PromptConversionPrompt,
} from "./gemini.ts";

test("standard mode builders follow the documented staged JSON contract", () => {
  const stage1 = buildStandardStage1AnalysisPrompt({
    country: "US",
    language: "en",
    platform: "amazon",
    category: "general",
    brandName: "Acme",
    sellingPoints: "lightweight, durable",
    restrictions: "no floating text",
    sourceDescription: "hero use case",
    materialInfo: "aluminum",
    sizeInfo: "20 cm",
    imageType: "main-image",
  });
  const stage2 = buildStandardStage2PromptConversionPrompt({
    analysisJson: { mode: "standard" },
    ratio: "1:1",
    resolutionLabel: "4K",
    imageType: "main-image",
  });

  assert.match(stage1, /standard stage 1 analysis json/);
  assert.match(stage1, /mode must be standard\./);
  assert.match(stage1, /Top-level JSON keys must be exactly: mode, image_type, subject_analysis, reference_analysis, visual_plan, prompt_constraints\./);
  assert.match(stage2, /standard stage 2 prompt conversion json/);
  assert.match(stage2, /Return JSON only with final_prompt and negative_constraints\./);
});

test("suite mode builders emit set analysis and per-image planning fields", () => {
  const stage1 = buildSetStage1AnalysisPrompt({
    country: "US",
    language: "en",
    platform: "amazon",
    category: "general",
    brandName: "Acme",
    sellingPoints: "lightweight, durable",
    restrictions: "no floating text",
    sourceDescription: "hero use case",
    materialInfo: "aluminum",
    sizeInfo: "20 cm",
  });
  const plan = buildSetPerImagePlan(
    {
      mode: "set",
      subject_analysis: {},
      set_plan: {},
    },
    {
      imageType: "feature-overview",
      ratio: "4:5",
    },
  );
  const conversion = buildSetPerImagePromptConversionPrompt({
    planningJson: plan,
    subjectAnalysisJson: {},
    ratio: "4:5",
    resolutionLabel: "1536px",
  });

  assert.match(stage1, /suite stage 1 set analysis json/);
  assert.match(stage1, /mode must be set\./);
  assert.equal(plan.image_type, "feature-overview");
  assert.ok(Array.isArray(plan.focus_points));
  assert.ok(typeof plan.scene_description === "string" && plan.scene_description.length > 0);
  assert.match(conversion, /suite per-image planning json/);
  assert.match(conversion, /suite per-image prompt conversion json/);
});

test("amazon mode builders emit amazon analysis and per-module planning fields", () => {
  const stage1 = buildAmazonStage1AnalysisPrompt({
    country: "US",
    language: "en",
    platform: "amazon",
    category: "general",
    brandName: "Acme",
    sellingPoints: "lightweight, durable",
    restrictions: "no floating text",
    sourceDescription: "hero use case",
    materialInfo: "aluminum",
    sizeInfo: "20 cm",
  });
  const plan = buildAmazonPerModulePlan(
    {
      mode: "amazon",
      product_analysis: {},
      amazon_plan: {},
    },
    {
      imageType: "poster",
      ratio: "4:5",
    },
  );
  const conversion = buildAmazonPerModulePromptConversionPrompt({
    planningJson: plan,
    productAnalysisJson: {},
    ratio: "4:5",
    resolutionLabel: "1536px",
  });

  assert.match(stage1, /amazon stage 1 analysis json/);
  assert.match(stage1, /mode must be amazon\./);
  assert.equal(plan.module_name, "poster");
  assert.ok(Array.isArray(plan.focus_points));
  assert.ok(typeof plan.module_goal === "string" && plan.module_goal.length > 0);
  assert.match(conversion, /amazon per-module planning json/);
  assert.match(conversion, /amazon per-module prompt conversion json/);
});
