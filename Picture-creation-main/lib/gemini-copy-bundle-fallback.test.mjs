import test from "node:test";
import assert from "node:assert/strict";

import {
  buildReferenceRemixFallbackOptimizedPrompt,
  buildReferenceRemixStage1AnalysisPrompt,
  buildReferenceRemixStage2PromptConversionPrompt,
  getImageGenerationTemperature,
  getModeWorkflowCopyTemperature,
  getSharedModeAnalysisTemperature,
  parseCopyBundleResponse,
  resolveImageGenerationPromptText,
  sanitizeWorkflowOptimizedPrompt,
} from "./gemini.ts";

test("parseCopyBundleResponse falls back to usable copy when provider returns markdown", () => {
  const markdownResponse = `
### Shared Analysis Layer
Headline: Sunset Glow Serum
Primary Value Prop: Deep hydration and barrier support

### Prompt Draft
Create a clean studio product poster with soft golden rim light, realistic glass reflections, premium skincare styling, and copy-safe top-left whitespace.
`;

  const parsed = parseCopyBundleResponse(markdownResponse, "Sunset Glow Serum");

  assert.ok(parsed.optimizedPrompt.length > 0);
  assert.equal(parsed.title, "Sunset Glow Serum");
  assert.equal(parsed.posterHeadline, "Sunset Glow Serum");
  assert.ok(!parsed.optimizedPrompt.includes("###"));
});

test("parseCopyBundleResponse preserves valid JSON output fields", () => {
  const rawJson = JSON.stringify({
    optimizedPrompt: "realistic product photo prompt",
    title: "Json Title",
    subtitle: "Json Subtitle",
    highlights: ["A", "B"],
    detailAngles: ["angle"],
    painPoints: ["pain"],
    cta: "Buy now",
    posterHeadline: "Json Poster",
    posterSubline: "Json Subline",
  });

  const parsed = parseCopyBundleResponse(rawJson, "Fallback Product");

  assert.equal(parsed.optimizedPrompt, "realistic product photo prompt");
  assert.equal(parsed.title, "Json Title");
  assert.equal(parsed.posterHeadline, "Json Poster");
  assert.deepEqual(parsed.highlights, ["A", "B"]);
  assert.equal(parsed.cta, "Buy now");
});

test("sanitizeWorkflowOptimizedPrompt removes JSON-shaped prompt leakage and keeps plain prompts", () => {
  assert.equal(
    sanitizeWorkflowOptimizedPrompt('{"scene":"studio","lighting":"soft"}', "fallback plain prompt"),
    "fallback plain prompt",
  );
  assert.equal(
    sanitizeWorkflowOptimizedPrompt("A realistic product photo in a clean studio.", "fallback plain prompt"),
    "A realistic product photo in a clean studio.",
  );
});

test("reference-remix stage prompts are reference-first and do not anchor on productName", () => {
  const stage1Prompt = buildReferenceRemixStage1AnalysisPrompt({
    brandName: "Acme",
    category: "dress",
    productName: "IMG_20260321_8812",
    sellingPoints: "flowing hemline",
    restrictions: "no logo",
    sourceDescription: "model identity from source image only",
    materialInfo: "cotton blend",
    sizeInfo: "length 128cm",
  });
  const stage2Prompt = buildReferenceRemixStage2PromptConversionPrompt({
    analysisJson: { mode: "reference-remix" },
    taskType: "构图镜头复刻",
    ratio: "3:4",
    resolutionLabel: "1536px",
    brandName: "Acme",
    category: "dress",
    productName: "IMG_20260321_8812",
    sellingPoints: "flowing hemline",
    restrictions: "no logo",
    sourceDescription: "model identity from source image only",
  });

  assert.match(
    stage1Prompt,
    /Reference image is the primary blueprint for composition, shot distance, pose\/action, clothing silhouette\/color blocking, background structure, prop relationships, lighting, and mood\./,
  );
  assert.match(stage1Prompt, /Use the source image only for identity truth\./);
  assert.match(
    stage1Prompt,
    /If the source image is headshot or half-body while the reference is full-body, still reconstruct the full-body composition from the reference\./,
  );
  assert.match(stage2Prompt, /Reference-first execution is mandatory\./);
  assert.match(stage2Prompt, /Use the source image only for identity truth\./);
  assert.match(
    stage2Prompt,
    /For headshot\/half-body source with full-body reference, reconstruct the full-body composition from the reference rather than collapsing into a portrait\./,
  );
  assert.doesNotMatch(stage1Prompt, /Product name:/);
  assert.doesNotMatch(stage2Prompt, /Product name:/);
  assert.ok(!stage1Prompt.includes("IMG_20260321_8812"));
  assert.ok(!stage2Prompt.includes("IMG_20260321_8812"));
});

test("reference-remix fallback prompt stays reference-first and does not use productName semantics", () => {
  const fallbackPrompt = buildReferenceRemixFallbackOptimizedPrompt({
    sellingPoints: "flowing hemline",
    restrictions: "no logo",
    sourceDescription: "model identity from source image only",
  });

  assert.match(fallbackPrompt, /Reference image is the primary blueprint/);
  assert.match(fallbackPrompt, /Use the source image only for identity truth\./);
  assert.match(
    fallbackPrompt,
    /If the source image is headshot or half-body while the reference is full-body, still reconstruct the full-body composition from the reference\./,
  );
  assert.doesNotMatch(fallbackPrompt, /Product name:/);
});

test("reference-remix workflow temperatures are reduced, including image temperature", () => {
  assert.equal(getSharedModeAnalysisTemperature("reference-remix"), 0.1);
  assert.equal(getModeWorkflowCopyTemperature("reference-remix"), 0.2);
  assert.equal(getImageGenerationTemperature("reference-remix"), 0.6);
  assert.equal(getImageGenerationTemperature("standard"), 0.7);
});

test("prompt mode always wraps raw prompt text into an image-generation instruction when source images exist", () => {
  const promptText = resolveImageGenerationPromptText({
    creationMode: "prompt",
    customPromptText: "10cmx2cm，15g，6号鱼钩，ABS安全硬材质，翻译成英文",
    country: "US",
    language: "en-US",
    platform: "amazon",
    category: "general",
    brandName: "",
    productName: "Fishing lure",
    sellingPoints: "",
    restrictions: "",
    sourceDescription: "",
    materialInfo: "ABS",
    sizeInfo: "10cm x 2cm, 15g",
    imageType: "scene",
    ratio: "1:1",
    resolutionLabel: "4K",
    copy: {
      optimizedPrompt: "unused fallback",
      title: "",
      subtitle: "",
      highlights: [],
      detailAngles: [],
      painPoints: [],
      cta: "",
      posterHeadline: "",
      posterSubline: "",
    },
    sourceImageCount: 1,
  });

  assert.notEqual(promptText, "10cmx2cm，15g，6号鱼钩，ABS安全硬材质，翻译成英文");
  assert.match(promptText, /This is an image-generation request\./);
  assert.match(promptText, /Use the uploaded source image\(s\) as the product identity reference\./);
  assert.match(promptText, /Do not answer with a translation, rewrite, explanation, or any text-only response\./);
  assert.match(promptText, /User creative prompt: 10cmx2cm，15g，6号鱼钩，ABS安全硬材质，翻译成英文/);
});

test("prompt mode text-to-image prompt uses no-source wording instead of source-image edit wording", () => {
  const promptText = resolveImageGenerationPromptText({
    creationMode: "prompt",
    customPromptText: "premium fishing lure on white background",
    country: "US",
    language: "en-US",
    platform: "amazon",
    category: "general",
    brandName: "",
    productName: "Fishing lure",
    sellingPoints: "",
    restrictions: "",
    sourceDescription: "",
    imageType: "scene",
    ratio: "1:1",
    resolutionLabel: "1K",
    copy: {
      optimizedPrompt: "unused fallback",
      title: "",
      subtitle: "",
      highlights: [],
      detailAngles: [],
      painPoints: [],
      cta: "",
      posterHeadline: "",
      posterSubline: "",
    },
    sourceImageCount: 0,
  });

  assert.match(promptText, /Generate a new product image for a amazon listing in en-US for market US\./);
  assert.match(promptText, /No source images are provided\./);
  assert.match(promptText, /Do not answer with a translation, rewrite, explanation, or any text-only response\./);
  assert.doesNotMatch(promptText, /uploaded product/i);
  assert.doesNotMatch(promptText, /Keep the product identity, silhouette, materials, label placement, and recognizable shape consistent with the source image\./);
});

test("prompt mode wrapper can be forced without creationMode and uses copy optimized prompt as fallback", () => {
  const promptText = resolveImageGenerationPromptText({
    wrapPromptModeText: true,
    country: "US",
    language: "en-US",
    platform: "amazon",
    category: "general",
    brandName: "",
    productName: "Fishing lure",
    sellingPoints: "",
    restrictions: "",
    sourceDescription: "",
    imageType: "scene",
    ratio: "1:1",
    resolutionLabel: "1K",
    copy: {
      optimizedPrompt: "translate this lure description to English",
      title: "",
      subtitle: "",
      highlights: [],
      detailAngles: [],
      painPoints: [],
      cta: "",
      posterHeadline: "",
      posterSubline: "",
    },
    sourceImageCount: 1,
  });

  assert.match(promptText, /This is an image-generation request\./);
  assert.match(promptText, /User creative prompt: translate this lure description to English/);
  assert.match(promptText, /Use the uploaded source image\(s\) as the product identity reference\./);
});
