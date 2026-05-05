import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketingExecutionPrompt, finalizeMarketingStrategy } from "./gemini.ts";
import {
  appendQualityEnhancements,
  buildQualityEnhancementLine,
  QUALITY_ENHANCEMENT_KEYWORDS,
  selectQualityEnhancementKeywords,
} from "./prompt-quality-enhancements.ts";
import { buildPromptModePrompt } from "./templates.ts";

test("quality enhancement catalog covers all five categories", () => {
  const categories = new Set(QUALITY_ENHANCEMENT_KEYWORDS.map((item) => item.category));

  assert.deepEqual(
    [...categories].sort(),
    [
      "base_quality",
      "camera_and_lens",
      "color_and_post_processing",
      "lighting",
      "materials_and_details",
    ],
  );
});

test("selector returns 3-5 deterministic non-conflicting hero keywords in english", () => {
  const selected = selectQualityEnhancementKeywords({
    mode: "standard",
    language: "en-US",
    category: "general",
    imageType: "hero-poster",
    promptText: "",
  });

  assert.ok(selected.length >= 3 && selected.length <= 5);
  assert.ok(new Set(selected.map((item) => item.id)).size === selected.length);
  assert.ok(selected.some((item) => item.keywordEn === "RAW photo"));
  assert.ok(selected.some((item) => item.keywordEn === "Hasselblad" || item.keywordEn === "shot on DSLR"));
  assert.ok(selected.some((item) => item.keywordEn === "softbox lighting" || item.keywordEn === "rim lighting"));
  assert.ok(selected.some((item) => item.keywordEn === "color grading" || item.keywordEn === "HDR" || item.keywordEn === "high contrast"));
  assert.equal(selected.filter((item) => item.category === "base_quality").length, 1);
  assert.ok(
    !(
      selected.some((item) => item.keywordEn === "shallow depth of field") &&
      selected.some((item) => item.keywordEn === "f/8")
    ),
  );
});

test("selector uses Chinese keywords for zh-CN and falls back to English for non-zh, non-en languages", () => {
  const zhLine = buildQualityEnhancementLine(
    selectQualityEnhancementKeywords({
      mode: "standard",
      language: "zh-CN",
      category: "general",
      imageType: "hero-poster",
      promptText: "",
    }),
    "zh-CN",
  );
  const deLine = buildQualityEnhancementLine(
    selectQualityEnhancementKeywords({
      mode: "standard",
      language: "de-DE",
      category: "general",
      imageType: "hero-poster",
      promptText: "",
    }),
    "de-DE",
  );

  assert.match(zhLine, /^画质强化：/);
  assert.match(zhLine, /RAW照片质感|最佳质量|超高清|影棚布光|色彩分级/);
  assert.match(deLine, /^Quality emphasis:/);
  assert.match(deLine, /RAW photo|best quality|studio lighting|color grading/);
});

test("detail selection differs from hero and uses detail-friendly optics", () => {
  const hero = selectQualityEnhancementKeywords({
    mode: "amazon-a-plus",
    language: "en-US",
    category: "outdoor",
    imageType: "hero-poster",
    promptText: "",
  });
  const detail = selectQualityEnhancementKeywords({
    mode: "amazon-a-plus",
    language: "en-US",
    category: "outdoor",
    imageType: "hook-hardware-proof",
    promptText: "",
  });

  assert.notDeepEqual(hero.map((item) => item.id), detail.map((item) => item.id));
  assert.ok(detail.some((item) => item.keywordEn === "macro lens"));
  assert.ok(detail.some((item) => item.keywordEn === "f/8" || item.keywordEn === "sharp focus"));
  assert.ok(detail.some((item) => item.keywordEn === "hard directional lighting"));
  assert.ok(
    detail.some((item) =>
      ["hyper-realistic textures", "physically based rendering", "tactile texture", "microscopic details"].includes(
        item.keywordEn,
      ),
    ),
  );
  assert.ok(!hero.some((item) => item.keywordEn === "macro lens"));
});

test("prompt mode infers hero and detail profiles from user prompt semantics", () => {
  const hero = selectQualityEnhancementKeywords({
    mode: "prompt",
    language: "en-US",
    category: "general",
    imageType: "scene",
    promptText: "premium hero poster ad campaign visual with bold brand impact",
  });
  const detail = selectQualityEnhancementKeywords({
    mode: "prompt",
    language: "en-US",
    category: "general",
    imageType: "scene",
    promptText: "macro close-up material texture detail shot of the product hardware",
  });

  assert.ok(hero.some((item) => item.keywordEn === "Hasselblad" || item.keywordEn === "shot on DSLR"));
  assert.ok(detail.some((item) => item.keywordEn === "macro lens"));
});

test("appendQualityEnhancements avoids duplicating existing quality keywords", () => {
  const enhanced = appendQualityEnhancements({
    promptText: "Create a premium ecommerce image. RAW photo. studio lighting.",
    context: {
      mode: "standard",
      language: "en-US",
      category: "general",
      imageType: "hero-poster",
    },
  });

  assert.match(enhanced, /Quality emphasis:/);
  assert.equal((enhanced.match(/RAW photo/g) ?? []).length, 1);
  assert.equal((enhanced.match(/studio lighting/g) ?? []).length, 1);
});

test("marketing execution prompt appends quality emphasis and keeps hero/detail combinations different", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Fishing lure",
      sellingPoints: "Realistic finish, durable hooks, strong action",
      sourceDescription: "Fishing lure on white background",
      materialInfo: "ABS body with metal hooks",
      sizeInfo: "10 cm body",
    },
  );

  const heroPrompt = buildMarketingExecutionPrompt({
    marketingStrategy: strategy,
    imageStrategy: {
      id: "hero-poster",
      imageType: "hero-poster",
      title: "Hero",
      marketingRole: "Hero conversion visual",
      primarySellingPoint: "Realistic finish",
      sceneType: "Hero ad scene",
      compositionGuidance: "Center-weighted hero",
      copySpaceGuidance: "Top whitespace",
      moodLighting: "Premium bright lighting",
      outputRatio: "4:5",
      whyNeeded: "Sell immediately",
    },
    productName: "Fishing lure",
    brandName: "",
    sellingPoints: "Realistic finish, durable hooks, strong action",
    restrictions: "No fake text",
    sourceDescription: "Fishing lure on white background",
    materialInfo: "ABS body with metal hooks",
    sizeInfo: "10 cm body",
    ratio: "4:5",
    resolutionLabel: "1K",
    language: "en-US",
  });
  const detailPrompt = buildMarketingExecutionPrompt({
    marketingStrategy: strategy,
    imageStrategy: {
      id: "hook-hardware-proof",
      imageType: "hook-hardware-proof",
      title: "Detail",
      marketingRole: "Hook hardware proof",
      primarySellingPoint: "Metal hardware trust",
      sceneType: "Macro technical detail",
      compositionGuidance: "Tight crop",
      copySpaceGuidance: "Lower whitespace",
      moodLighting: "Hard side light",
      outputRatio: "1:1",
      whyNeeded: "Reduce skepticism",
    },
    productName: "Fishing lure",
    brandName: "",
    sellingPoints: "Realistic finish, durable hooks, strong action",
    restrictions: "No fake text",
    sourceDescription: "Fishing lure on white background",
    materialInfo: "ABS body with metal hooks",
    sizeInfo: "10 cm body",
    ratio: "1:1",
    resolutionLabel: "1K",
    language: "en-US",
  });

  assert.match(heroPrompt, /Quality emphasis:/);
  assert.match(detailPrompt, /Quality emphasis:/);
  assert.notEqual(
    heroPrompt.match(/Quality emphasis:.+/)?.[0] ?? "",
    detailPrompt.match(/Quality emphasis:.+/)?.[0] ?? "",
  );
});

test("prompt mode prompt appends quality emphasis without duplicating user-provided quality tokens", () => {
  const prompt = buildPromptModePrompt({
    country: "US",
    language: "en-US",
    platform: "amazon",
    category: "general",
    productName: "Fishing lure",
    brandName: "",
    sellingPoints: "Strong hook",
    restrictions: "No fake text",
    sourceDescription: "White background",
    materialInfo: "ABS",
    sizeInfo: "10 cm",
    imageType: "scene",
    ratio: "1:1",
    resolutionLabel: "1K",
    customPrompt: "RAW photo close-up product scene with studio lighting and sharp focus",
    hasSourceImages: true,
  });

  assert.match(prompt, /Quality emphasis:/);
  assert.equal((prompt.match(/RAW photo/g) ?? []).length, 1);
  assert.equal((prompt.match(/studio lighting/g) ?? []).length, 1);
});
