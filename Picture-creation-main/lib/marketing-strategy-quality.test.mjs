import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFallbackMarketingImageStrategies,
  buildMarketingExecutionPrompt,
  filterSizeDrivenMarketingImageStrategies,
  finalizeMarketingStrategy,
} from "./gemini.ts";

test("finalizeMarketingStrategy produces non-empty fishing-lure marketing guidance from sparse model output", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Multi-jointed swimbait lure",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      sourceDescription: "Lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with metal hooks",
      sizeInfo: "10 cm lure body",
    },
  );

  assert.match(strategy.categoryJudgment, /fishing|lure|swimbait/i);
  assert.ok(strategy.prioritizedSellingPoints.length >= 3);
  assert.ok(strategy.recommendedContentStructure.length >= 3);
  assert.ok(strategy.avoidDirections.length >= 2);
  assert.match(strategy.targetAudience, /angler|fishing/i);
  assert.match(strategy.conversionGoal, /strike|fish|confidence|purchase/i);
});

test("buildFallbackMarketingImageStrategies gives fishing-lure-specific amazon modules", () => {
  const items = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Multi-jointed swimbait lure",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    sourceDescription: "Lifelike articulated fish lure on white background",
  });

  assert.equal(items.length, 4);
  assert.match(items[0].marketingRole, /click|hero|conversion/i);
  assert.match(items[1].primarySellingPoint, /action|swim|movement/i);
  assert.match(items[2].primarySellingPoint, /hook|hardware|durability/i);
  assert.match(items[3].sceneType, /water|fishing|predator|use/i);
  assert.doesNotMatch(items[1].primarySellingPoint, /segmented|articulated/i);
});

test("buildMarketingExecutionPrompt differentiates fishing-lure prompts beyond role labels", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Multi-jointed swimbait lure",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      sourceDescription: "Lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with metal hooks",
      sizeInfo: "10 cm lure body",
    },
  );

  const items = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Multi-jointed swimbait lure",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    sourceDescription: "Lifelike articulated fish lure on white background",
  });

  const prompts = items.map((imageStrategy) =>
    buildMarketingExecutionPrompt({
      marketingStrategy: strategy,
      imageStrategy,
      productName: "Multi-jointed swimbait lure",
      brandName: "",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      restrictions: "No fake text overlay",
      sourceDescription: "Lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with metal hooks",
      sizeInfo: "10 cm lure body",
      ratio: "4:5",
      resolutionLabel: "1K",
    }),
  );

  assert.match(prompts[0], /hero shot|premium advertising backdrop|click-through/i);
  assert.match(prompts[1], /motion|swim path|body roll|dynamic/i);
  assert.match(prompts[2], /macro|hook hardware|metal detail|close-up/i);
  assert.match(prompts[3], /waterline|freshwater|predator fishing|outdoor/i);
  assert.match(prompts[0], /Quality emphasis: .*RAW photo.*(Hasselblad|shot on DSLR).*(softbox lighting|rim lighting).*(color grading|HDR|high contrast)/i);
  assert.match(prompts[2], /Quality emphasis:/i);
  assert.match(prompts[2], /macro lens/i);
  assert.match(prompts[2], /f\/8|sharp focus/i);
  assert.match(prompts[2], /hard directional lighting/i);
});

test("buildMarketingExecutionPrompt gives each fishing-lure module a distinct camera and environment directive", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Multi-jointed swimbait lure",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      sourceDescription: "Lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with metal hooks",
      sizeInfo: "10 cm lure body",
    },
  );

  const items = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Multi-jointed swimbait lure",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    sourceDescription: "Lifelike articulated fish lure on white background",
  });

  const prompts = Object.fromEntries(
    items.map((imageStrategy) => [
      imageStrategy.imageType,
      buildMarketingExecutionPrompt({
        marketingStrategy: strategy,
        imageStrategy,
        productName: "Multi-jointed swimbait lure",
        brandName: "",
        sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
        restrictions: "No fake text overlay",
        sourceDescription: "Lifelike articulated fish lure on white background",
        materialInfo: "Hard bait body with metal hooks",
        sizeInfo: "10 cm lure body",
        ratio: "4:5",
        resolutionLabel: "1K",
      }),
    ]),
  );

  assert.match(prompts["hero-poster"], /low three-quarter hero angle|premium clean backdrop/i);
  assert.match(prompts["action-motion-proof"], /side-profile action angle|body roll|surface wake/i);
  assert.match(prompts["hook-hardware-proof"], /ultra-close macro|treble hook|split ring/i);
  assert.match(prompts["water-use-scenario"], /waterline perspective|freshwater shoreline|predator-fishing context/i);
});

test("action-motion-proof prompt avoids articulation language and explicitly preserves body topology", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Multi-jointed swimbait lure",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with segmented articulated structure and metal hooks",
      sizeInfo: "Approx 10 cm class lure body",
    },
  );

  const actionPlan = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Multi-jointed swimbait lure",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
  })[1];

  const prompt = buildMarketingExecutionPrompt({
    marketingStrategy: strategy,
    imageStrategy: actionPlan,
    productName: "Multi-jointed swimbait lure",
    brandName: "",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    restrictions: "No fake text overlay",
    sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
    materialInfo: "Hard bait body with segmented articulated structure and metal hooks",
    sizeInfo: "Approx 10 cm class lure body",
    ratio: "4:5",
    resolutionLabel: "1K",
  });

  assert.doesNotMatch(prompt, /articulated S-curve body line/i);
  assert.doesNotMatch(prompt, /segmented movement/i);
  assert.match(prompt, /without changing the lure's body topology/i);
  assert.match(prompt, /swim path|body roll|wake/i);
});

test("finalizeMarketingStrategy includes hard structural truths and hard no-text policy for fishing lure", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Multi-jointed swimbait lure",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with segmented articulated structure and metal hooks",
      sizeInfo: "Approx 10 cm class lure body",
    },
  );

  assert.ok(strategy.mustPreserveStructuralTruths.length >= 4);
  assert.match(strategy.mustPreserveStructuralTruths.join(" "), /body topology|hook count|hardware|lip/i);
  assert.match(strategy.textOverlayPolicy, /no visible text|no badges|no callout bubbles/i);
});

test("buildMarketingExecutionPrompt carries structural-truth and no-text-overlay hard constraints", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Multi-jointed swimbait lure",
      sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
      sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
      materialInfo: "Hard bait body with segmented articulated structure and metal hooks",
      sizeInfo: "Approx 10 cm class lure body",
    },
  );

  const hero = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Multi-jointed swimbait lure",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
  })[0];

  const prompt = buildMarketingExecutionPrompt({
    marketingStrategy: strategy,
    imageStrategy: hero,
    productName: "Multi-jointed swimbait lure",
    brandName: "",
    sellingPoints: "Realistic fish-body finish, segmented swimming action, treble hook setup",
    restrictions: "No fake text overlay",
    sourceDescription: "Single product photo of a lifelike articulated fish lure on white background",
    materialInfo: "Hard bait body with segmented articulated structure and metal hooks",
    sizeInfo: "Approx 10 cm class lure body",
    ratio: "4:5",
    resolutionLabel: "1K",
  });

  assert.match(prompt, /Structural truth is mandatory/i);
  assert.match(prompt, /Do not add articulation joints if the source lure is single-body/i);
  assert.match(prompt, /Preserve hook count and placement exactly/i);
  assert.match(prompt, /Do not render any visible text, badge, logo, watermark, label, or callout bubble in the image/i);
});

test("size-driven strategies are removed when size info is empty", () => {
  const strategies = [
    {
      id: "hero-main",
      imageType: "hero-main",
      title: "Hero",
      marketingRole: "Main hero",
      primarySellingPoint: "Main benefit",
      sceneType: "Hero scene",
      compositionGuidance: "Hero framing",
      copySpaceGuidance: "Top whitespace",
      moodLighting: "Premium light",
      outputRatio: "1:1",
      whyNeeded: "Sell immediately",
    },
    {
      id: "size-spec",
      imageType: "size-spec",
      title: "Size spec",
      marketingRole: "Dimension and size proof",
      primarySellingPoint: "Dimensions",
      sceneType: "Technical size spec scene",
      compositionGuidance: "Outline for measurements",
      copySpaceGuidance: "Large label area",
      moodLighting: "Technical light",
      outputRatio: "1:1",
      whyNeeded: "Show measurements",
    },
    {
      id: "spec-proof",
      imageType: "spec-proof",
      title: "Spec proof",
      marketingRole: "Specification and parameter proof",
      primarySellingPoint: "Parameters",
      sceneType: "Specification scene",
      compositionGuidance: "Grid-like technical composition",
      copySpaceGuidance: "Label-safe area",
      moodLighting: "Clear light",
      outputRatio: "1:1",
      whyNeeded: "Explain specifications",
    },
  ];

  const filtered = filterSizeDrivenMarketingImageStrategies(strategies, "");
  const keptWithSize = filterSizeDrivenMarketingImageStrategies(strategies, "10 cm x 2 cm");

  assert.deepEqual(filtered.map((item) => item.imageType), ["hero-main"]);
  assert.deepEqual(keptWithSize.map((item) => item.imageType), ["hero-main", "size-spec", "spec-proof"]);
});

test("hero prompt explicitly forbids falling back to plain white catalog treatment", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Fishing lure",
      sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
      sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
      materialInfo: "ABS hard bait body with metal hooks and hardware",
      sizeInfo: "10 cm lure body",
    },
  );

  const hero = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Fishing lure",
    sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
    sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
  })[0];

  const prompt = buildMarketingExecutionPrompt({
    marketingStrategy: strategy,
    imageStrategy: hero,
    productName: "Fishing lure",
    brandName: "",
    sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
    restrictions: "No fake text overlay",
    sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
    materialInfo: "ABS hard bait body with metal hooks and hardware",
    sizeInfo: "10 cm lure body",
    ratio: "4:5",
    resolutionLabel: "1K",
    language: "en-US",
    mode: "amazon-a-plus",
    category: "outdoor",
  });

  assert.match(prompt, /Do not fall back to a plain white catalog background/i);
  assert.match(prompt, /Do not render the product as an isolated object on empty white/i);
  assert.match(prompt, /Keep a premium advertising backdrop, controlled shadow, and strong hero focal staging/i);
});

test("detail prompt explicitly requires structural proof anchors instead of a generic near shot", () => {
  const strategy = finalizeMarketingStrategy(
    {},
    {
      mode: "amazon-a-plus",
      category: "outdoor",
      productName: "Fishing lure",
      sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
      sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
      materialInfo: "ABS hard bait body with metal hooks and hardware",
      sizeInfo: "10 cm lure body",
    },
  );

  const detail = buildFallbackMarketingImageStrategies("amazon-a-plus", "4:5", {
    category: "outdoor",
    productName: "Fishing lure",
    sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
    sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
  })[2];

  const prompt = buildMarketingExecutionPrompt({
    marketingStrategy: strategy,
    imageStrategy: detail,
    productName: "Fishing lure",
    brandName: "",
    sellingPoints: "Realistic fish-body finish, durable treble hooks, believable swimming action",
    restrictions: "No fake text overlay",
    sourceDescription: "Single product photo of a realistic fishing lure on a clean white background",
    materialInfo: "ABS hard bait body with metal hooks and hardware",
    sizeInfo: "10 cm lure body",
    ratio: "4:5",
    resolutionLabel: "1K",
    language: "en-US",
    mode: "amazon-a-plus",
    category: "outdoor",
  });

  assert.match(prompt, /Do not settle for a generic close-up texture shot/i);
  assert.match(prompt, /Keep at least two structural proof anchors visible/i);
  assert.match(prompt, /diving lip|hook set|hardware connection|body texture/i);
  assert.match(prompt, /At least one visible anchor must clearly prove the lure body itself/i);
});
