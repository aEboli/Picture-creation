import test from "node:test";
import assert from "node:assert/strict";

import { buildFeaturePromptScenarioPlan } from "./gemini.ts";

const fishLureAnalysis = {
  mainSubject: "multi-jointed swimbait lure",
  categoryGuess: "outdoor fishing lure",
  coreFeatures: ["4-segment body", "red tail", "treble hooks"],
  visualCharacteristics: ["realistic scale texture", "metal joints", "front propeller"],
  materialSignals: ["hard plastic body", "metal hardware"],
  mustPreserve: ["4-segment body", "red tail", "treble hooks", "front propeller"],
};

test("fish lure scene groups choose materially different scenario plans instead of one fixed template", () => {
  const first = buildFeaturePromptScenarioPlan({
    imageType: "scene",
    analysis: fishLureAnalysis,
    groupIndex: 1,
    groupCount: 2,
    language: "zh-CN",
  });
  const second = buildFeaturePromptScenarioPlan({
    imageType: "scene",
    analysis: fishLureAnalysis,
    groupIndex: 2,
    groupCount: 2,
    language: "zh-CN",
  });

  assert.notEqual(first.family, second.family);
  assert.notEqual(first.sceneDirection, second.sceneDirection);
  assert.match(first.differentiationRule, /primary scenario family|strongest initial angle/i);
  assert.match(second.differentiationRule, /materially different|different unmet selling angle/i);
});

test("feature overview is treated as a copy-driven image with limited text blocks", () => {
  const plan = buildFeaturePromptScenarioPlan({
    imageType: "feature-overview",
    analysis: fishLureAnalysis,
    groupIndex: 1,
    groupCount: 1,
    language: "zh-CN",
  });

  assert.equal(plan.copyEnabled, true);
  assert.match(plan.copyRule, /one short headline|1 headline/i);
  assert.match(plan.copyRule, /two short benefit lines|2 short benefit lines|2条短卖点/i);
});

test("detail groups use different proof angles instead of near-identical closeups", () => {
  const first = buildFeaturePromptScenarioPlan({
    imageType: "detail",
    analysis: fishLureAnalysis,
    groupIndex: 1,
    groupCount: 2,
    language: "zh-CN",
  });
  const second = buildFeaturePromptScenarioPlan({
    imageType: "detail",
    analysis: fishLureAnalysis,
    groupIndex: 2,
    groupCount: 2,
    language: "zh-CN",
  });

  assert.notEqual(first.family, second.family);
  assert.notEqual(first.subjectFocus, second.subjectFocus);
  assert.notEqual(first.marketingIntent, second.marketingIntent);
});

test("size spec is treated as a copy-driven measurement image", () => {
  const plan = buildFeaturePromptScenarioPlan({
    imageType: "size-spec",
    analysis: fishLureAnalysis,
    groupIndex: 1,
    groupCount: 1,
    language: "zh-CN",
  });

  assert.equal(plan.copyEnabled, true);
  assert.match(plan.copyRule, /长|宽|dual-unit|measurement/i);
  assert.match(plan.sceneDirection, /尺寸|dimension|measurement/i);
  assert.match(plan.subjectFocus, /outside|外侧|主体外侧|whitespace/i);
  assert.match(plan.antiPatternRule, /over the product body|压在主体|outside the silhouette/i);
});
