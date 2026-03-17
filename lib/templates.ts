import { COUNTRIES, IMAGE_TYPE_OPTIONS, OUTPUT_LANGUAGES, PLATFORMS, PRODUCT_CATEGORIES } from "@/lib/constants";
import type {
  BrandRecord,
  GeneratedCopyBundle,
  ImageType,
  ReferenceBackgroundMode,
  ReferenceCompositionLock,
  ReferenceCopyMode,
  ReferenceLayoutAnalysis,
  ReferenceRemakeGoal,
  ReferencePosterCopy,
  ReferenceTextRegionPolicy,
  TemplateRecord,
} from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";

const platformStyles: Record<string, { tone: string; palette: string; layout: string }> = {
  amazon: {
    tone: "clean, premium, conversion-focused, compliant",
    palette: "white, blue, soft orange accents",
    layout: "clean comparison blocks and structured highlights",
  },
  "tiktok-shop": {
    tone: "energetic, social-first, trend-aware",
    palette: "high contrast, modern neon accents, dynamic lighting",
    layout: "bold headline, strong focal subject, creator-style motion cues",
  },
  taobao: {
    tone: "high-conversion, bold, fast-moving retail",
    palette: "warm reds, cream, vibrant product emphasis",
    layout: "promotional blocks with strong CTA and price-energy styling",
  },
  tmall: {
    tone: "premium retail, polished, aspirational",
    palette: "deep red, black, gold highlights",
    layout: "hero-led premium retail composition",
  },
  jd: {
    tone: "trustworthy, product-forward, efficient",
    palette: "white, red, silver",
    layout: "clean blocks, practical benefit framing",
  },
  pinduoduo: {
    tone: "high-value retail, direct, conversion-first",
    palette: "red, white, high-contrast promotional accents",
    layout: "dense value communication with bold offer framing",
  },
  temu: {
    tone: "cross-border marketplace, deal-driven, punchy",
    palette: "orange, white, bright retail contrast",
    layout: "fast-scanning marketplace module layout",
  },
  shein: {
    tone: "fashion-forward, trend-led, social-commerce ready",
    palette: "black, white, neutral fashion tones with crisp accents",
    layout: "editorial fashion-card composition with strong product styling",
  },
  shopee: {
    tone: "friendly, mobile-first, accessible",
    palette: "orange, white, fresh gradients",
    layout: "mobile shopping card style",
  },
  lazada: {
    tone: "bold marketplace retail",
    palette: "purple, pink, orange gradients",
    layout: "bright marketplace card layout",
  },
  ebay: {
    tone: "practical, clear, listing-oriented",
    palette: "white with bold color accents",
    layout: "clear specs and listing-oriented imagery",
  },
  etsy: {
    tone: "handcrafted, warm, lifestyle-rich",
    palette: "earthy neutrals, soft warm light",
    layout: "editorial product storytelling with handmade feel",
  },
  rakuten: {
    tone: "clean Japanese retail with trust and value",
    palette: "red, white, soft neutrals",
    layout: "structured retail composition with tidy text zones",
  },
  aliexpress: {
    tone: "global bargain retail, direct response",
    palette: "red, orange, bright highlights",
    layout: "clear value-first composition",
  },
};

const imageTypeGuides: Record<ImageType, { intent: string; extraPrompt: string; copyFocus: string }> = {
  "main-image": {
    intent: "Create a polished hero image that serves as the lead visual for a complete product image set.",
    extraPrompt: "Use a clean hero composition with exact product accuracy, strong focal hierarchy, and marketplace-friendly clarity.",
    copyFocus: "Introduce the product with its clearest value proposition and strongest first impression.",
  },
  lifestyle: {
    intent: "Show the product inside an aspirational lifestyle setup that feels natural and believable.",
    extraPrompt: "Build a tasteful lifestyle environment with human context, premium light, and a clear connection between the product and daily life.",
    copyFocus: "Connect the product to a desirable lifestyle or usage moment.",
  },
  scene: {
    intent: "Show the product naturally used inside a realistic context.",
    extraPrompt: "Build a believable scene around the product with commercial lighting and a clear hero focus.",
    copyFocus: "Lead with everyday value and contextual benefit.",
  },
  "white-background": {
    intent: "Create a clean marketplace-ready white background image.",
    extraPrompt: "Preserve accurate product edges, shape, proportions, and material finish on a pure or near-pure white background.",
    copyFocus: "Focus on core specs and trust-building clarity.",
  },
  model: {
    intent: "Show the product with a model or in human use.",
    extraPrompt: "Select a model styling aligned with the target market and keep the product identity exact.",
    copyFocus: "Highlight fit, comfort, or real-life usage.",
  },
  poster: {
    intent: "Produce a high-impact promotional poster creative.",
    extraPrompt: "Use dramatic composition, strong hierarchy, polished lighting, and visual hooks suitable for ads.",
    copyFocus: "Emphasize campaign energy and urgency.",
  },
  detail: {
    intent: "Zoom attention into the product’s craftsmanship and feature details.",
    extraPrompt: "Use tight crop logic, macro-friendly framing, and call out premium details visually.",
    copyFocus: "Surface material, structure, and product engineering.",
  },
  "pain-point": {
    intent: "Tell a before-vs-after or problem-vs-solution story.",
    extraPrompt: "Show a pain point clearly, then position the product as the hero solution without clutter.",
    copyFocus: "Anchor on user frustration and the product outcome.",
  },
  "feature-overview": {
    intent: "Build a clean feature-summary creative that introduces the product's main selling points in one frame.",
    extraPrompt: "Use a structured overview layout with one clear hero product and concise feature callouts that are easy to scan.",
    copyFocus: "Summarize the strongest product benefits in a compact comparison-style layout.",
  },
  "material-craft": {
    intent: "Focus on the material quality, finish, structural detail, and craftsmanship of the product.",
    extraPrompt: "Use crisp close-up framing, texture-led lighting, and tidy annotation logic to make material and craftsmanship feel premium and trustworthy.",
    copyFocus: "Explain why the material and construction quality matter.",
  },
  "size-spec": {
    intent: "Present dimensions, measurements, and key specifications in a clear e-commerce explainer graphic.",
    extraPrompt: "Keep the product accurate and readable while adding dimension lines, spec labels, and tidy measurement hierarchy.",
    copyFocus: "Translate size, dimensions, and key specs into clear shopping information.",
  },
  "multi-scene": {
    intent: "Show the product used naturally across multiple real-life scenarios inside one A+ style module.",
    extraPrompt: "Compose 2 to 4 distinct lifestyle moments or usage contexts in one coherent visual module while keeping the product identity exact.",
    copyFocus: "Demonstrate how the product fits different everyday use cases.",
  },
  "culture-value": {
    intent: "Communicate the product's emotional, cultural, or lifestyle value beyond raw specifications.",
    extraPrompt: "Use editorial storytelling, premium atmosphere, and symbolic lifestyle cues to express taste, identity, or emotional resonance.",
    copyFocus: "Frame the product as part of a desirable lifestyle or value system.",
  },
};

export function getTemplateSeedData(): TemplateRecord[] {
  const now = nowIso();
  return IMAGE_TYPE_OPTIONS.map((option) => ({
    id: createId("tpl"),
    name: `${option.value}-default`,
    country: "*",
    language: "*",
    platform: "*",
    category: "*",
    imageType: option.value,
    promptTemplate: imageTypeGuides[option.value].extraPrompt,
    copyTemplate: imageTypeGuides[option.value].copyFocus,
    layoutStyle: "adaptive",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  }));
}

export function getPlatformStyle(platform: string) {
  return platformStyles[platform] ?? {
    tone: "balanced, conversion-focused, clean",
    palette: "neutral brand-safe palette",
    layout: "clear retail-focused composition",
  };
}

export function getImageTypeGuide(imageType: ImageType) {
  return imageTypeGuides[imageType];
}

function normalizePromptText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePromptCategory(category?: string | null) {
  const trimmed = normalizePromptText(category);
  if (!trimmed || trimmed === "general") {
    return null;
  }

  return trimmed;
}

function buildPromptFactLine(facts: Array<[label: string, value?: string | null]>) {
  const parts = facts.flatMap(([label, value]) => {
    const normalized = normalizePromptText(value);
    return normalized ? [`${label}: ${normalized}`] : [];
  });

  return parts.length ? `${parts.join(". ")}.` : null;
}

function buildSimplifiedChineseOnlyLine(language: string) {
  return language.toLowerCase().startsWith("zh")
    ? "If any Chinese copy appears anywhere in the output, use Simplified Chinese only. Do not use Traditional Chinese."
    : null;
}

function buildRestrictionsLine(restrictions?: string | null) {
  return buildPromptFactLine([["Restrictions", restrictions]]);
}

function buildReferenceSlotTextLine(label: string, value?: string | null) {
  const normalized = normalizePromptText(value);
  return normalized ? `${label}: ${normalized}.` : null;
}

function buildTemplateOverrideLines(template?: TemplateRecord | null) {
  if (!template) {
    return [];
  }

  return [
    `Template name: ${template.name}.`,
    `Template scope: country=${template.country}, language=${template.language}, platform=${template.platform}, category=${template.category}, imageType=${template.imageType}.`,
    `Template prompt strategy: ${template.promptTemplate}`,
    `Template copy strategy: ${template.copyTemplate}`,
    `Template layout style: ${template.layoutStyle}`,
  ];
}

function buildBrandOverrideLines(brandProfile?: BrandRecord | null) {
  if (!brandProfile) {
    return [];
  }

  return [
    buildPromptFactLine([["Brand profile", brandProfile.name]]),
    buildPromptFactLine([["Brand primary color", brandProfile.primaryColor]]),
    buildPromptFactLine([["Brand tone", brandProfile.tone]]),
    buildPromptFactLine([["Brand banned terms", brandProfile.bannedTerms]]),
    buildPromptFactLine([["Brand guidance", brandProfile.promptGuidance]]),
  ].filter(Boolean);
}

const SELLING_POINT_IMAGE_TYPES = new Set<ImageType>(["feature-overview", "pain-point"]);
const MATERIAL_IMAGE_TYPES = new Set<ImageType>(["material-craft"]);
const SIZE_IMAGE_TYPES = new Set<ImageType>(["size-spec"]);
const IMPERIAL_PRIMARY_COUNTRIES = new Set(["US"]);
const METRIC_MEASUREMENT_UNITS = new Set(["mm", "cm", "m", "kg", "kgs", "g", "gram", "grams"]);
const IMPERIAL_MEASUREMENT_UNITS = new Set(["inch", "inches", "in", "ft", "feet", "lb", "lbs", "oz", "ounce", "ounces"]);

function shouldIncludeSellingPoints(imageType: ImageType) {
  return SELLING_POINT_IMAGE_TYPES.has(imageType);
}

function shouldIncludeMaterialInfo(imageType: ImageType) {
  return MATERIAL_IMAGE_TYPES.has(imageType);
}

function shouldIncludeSizeInfo(imageType: ImageType) {
  return SIZE_IMAGE_TYPES.has(imageType);
}

function formatMeasurementNumber(value: number) {
  const fixed = value >= 10 ? value.toFixed(1) : value.toFixed(2);
  return fixed.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function detectMeasurementSystems(sizeInfo: string) {
  const systems = {
    metric: false,
    imperial: false,
  };

  for (const match of sizeInfo.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|ft|feet|kg|kgs|g|grams|gram|lb|lbs|oz|ounce|ounces)\b/gi)) {
    const unit = match[2].toLowerCase();
    if (METRIC_MEASUREMENT_UNITS.has(unit)) {
      systems.metric = true;
    }
    if (IMPERIAL_MEASUREMENT_UNITS.has(unit)) {
      systems.imperial = true;
    }
  }

  return systems;
}

function buildDualMeasurementReference(sizeInfo?: string | null) {
  const normalized = normalizePromptText(sizeInfo);
  if (!normalized) {
    return null;
  }

  const tokens = Array.from(
    normalized.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|ft|feet|kg|kgs|g|grams|gram|lb|lbs|oz|ounce|ounces)\b/gi),
  );

  if (!tokens.length) {
    return null;
  }

  const converted = tokens
    .map((match) => {
      const value = Number(match[1]);
      const unit = match[2].toLowerCase();

      if (!Number.isFinite(value)) {
        return null;
      }

      if (unit === "mm") {
        return `${formatMeasurementNumber(value)} mm (${formatMeasurementNumber(value / 25.4)} in)`;
      }
      if (unit === "cm") {
        return `${formatMeasurementNumber(value)} cm (${formatMeasurementNumber(value / 2.54)} in)`;
      }
      if (unit === "m") {
        return `${formatMeasurementNumber(value)} m (${formatMeasurementNumber(value * 3.28084)} ft)`;
      }
      if (["inch", "inches", "in"].includes(unit)) {
        return `${formatMeasurementNumber(value)} in (${formatMeasurementNumber(value * 2.54)} cm)`;
      }
      if (["ft", "feet"].includes(unit)) {
        return `${formatMeasurementNumber(value)} ft (${formatMeasurementNumber(value * 30.48)} cm)`;
      }
      if (["kg", "kgs"].includes(unit)) {
        return `${formatMeasurementNumber(value)} kg (${formatMeasurementNumber(value * 2.20462)} lb)`;
      }
      if (["g", "gram", "grams"].includes(unit)) {
        return `${formatMeasurementNumber(value)} g (${formatMeasurementNumber(value / 28.3495)} oz)`;
      }
      if (["lb", "lbs"].includes(unit)) {
        return `${formatMeasurementNumber(value)} lb (${formatMeasurementNumber(value / 2.20462)} kg)`;
      }
      if (["oz", "ounce", "ounces"].includes(unit)) {
        return `${formatMeasurementNumber(value)} oz (${formatMeasurementNumber(value * 28.3495)} g)`;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));

  return converted.length ? converted.join(" · ") : null;
}

export function normalizeSizeInfoToDualUnits(sizeInfo?: string | null) {
  const normalized = normalizePromptText(sizeInfo);
  if (!normalized) {
    return null;
  }

  const systems = detectMeasurementSystems(normalized);
  if (systems.metric && systems.imperial) {
    return normalized;
  }

  const dualReference = buildDualMeasurementReference(normalized);
  return dualReference ? `${normalized}. Dual-unit normalized reference: ${dualReference}` : normalized;
}

function buildMeasurementPresentationLines(input: { country: string; sizeInfo?: string | null; allowMeasurementFocus?: boolean }) {
  const normalized = normalizeSizeInfoToDualUnits(input.sizeInfo);
  if (!normalized) {
    return [];
  }

  const primarySystem = IMPERIAL_PRIMARY_COUNTRIES.has(input.country) ? "imperial" : "metric";
  const dualReference = buildDualMeasurementReference(input.sizeInfo);

  return [
    `Size and weight source: ${normalized}.`,
    dualReference
      ? `If the operator supplied only one measurement system, expand it into dual units as: ${dualReference}.`
      : "If both metric and imperial units are already present, keep both systems consistent wherever measurements appear.",
    primarySystem === "imperial"
      ? "Whenever dimensions or weight appear, present imperial units first and metric units in parentheses."
      : "Whenever dimensions or weight appear, present metric units first and imperial units in parentheses.",
    input.allowMeasurementFocus
      ? "Use the provided size and weight details as structured shopping information in this output."
      : "Do not make size or weight the main story of this output. If any measurement appears incidentally, keep it in dual units.",
  ].filter(Boolean);
}

export function buildCopyPrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  brandProfile?: BrandRecord | null;
  productName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  template?: TemplateRecord | null;
}): string {
  const countryLabel = COUNTRIES.find((item) => item.value === input.country)?.label.en ?? input.country;
  const languageLabel = OUTPUT_LANGUAGES.find((item) => item.value === input.language)?.label.en ?? input.language;
  const platformLabel = PLATFORMS.find((item) => item.value === input.platform)?.label.en ?? input.platform;
  const categoryKey = normalizePromptCategory(input.category);
  const categoryLabel = categoryKey ? PRODUCT_CATEGORIES.find((item) => item.value === categoryKey)?.label.en ?? categoryKey : null;
  const imageGuide = getImageTypeGuide(input.imageType);
  const platformGuide = getPlatformStyle(input.platform);
  const sellingPoints = shouldIncludeSellingPoints(input.imageType) ? input.sellingPoints : "";
  const materialInfo = shouldIncludeMaterialInfo(input.imageType) ? input.materialInfo : "";
  const sizeInfo = normalizeSizeInfoToDualUnits(input.sizeInfo);
  const allowMeasurementFocus = shouldIncludeSizeInfo(input.imageType);
  const scopeLine = [`Target market: ${countryLabel}`, `Output language: ${languageLabel}`];
  if (categoryLabel) {
    scopeLine.push(`Category: ${categoryLabel}`);
  }

  return [
    `You are an expert e-commerce creative strategist for ${platformLabel}.`,
    `${scopeLine.join(". ")}.`,
    buildSimplifiedChineseOnlyLine(input.language),
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
    ]),
    ...buildBrandOverrideLines(input.brandProfile),
    buildPromptFactLine([["Selling points", sellingPoints]]),
    buildPromptFactLine([["Additional notes", input.sourceDescription]]),
    buildPromptFactLine([["Material information", materialInfo]]),
    buildPromptFactLine([["Size and weight information", sizeInfo]]),
    ...buildMeasurementPresentationLines({
      country: input.country,
      sizeInfo: input.sizeInfo,
      allowMeasurementFocus,
    }),
    shouldIncludeMaterialInfo(input.imageType)
      ? "Material notes belong only in this material-focused module. Do not turn them into unrelated selling-point copy."
      : "Do not mention material information in this image type unless it is visually obvious from the product itself.",
    allowMeasurementFocus
      ? "Use the provided size and weight details inside this size/spec-focused module."
      : sizeInfo
        ? "Do not make size or weight the main message of this image type. If measurements appear anywhere, keep them in dual units."
        : "Do not mention size, dimensions, or weight in this image type.",
    shouldIncludeSellingPoints(input.imageType)
      ? "Use the operator's selling points as the primary copy source for this feature-focused module."
      : "Do not force the operator's selling-point list into this image type.",
    buildRestrictionsLine(input.restrictions),
    `Creative goal: ${imageGuide.intent}`,
    `Platform tone: ${platformGuide.tone}. Platform palette: ${platformGuide.palette}.`,
    `Composition ratio: ${input.ratio}. Target resolution bucket: ${input.resolutionLabel}.`,
    `Copy focus: ${imageGuide.copyFocus}`,
    ...buildTemplateOverrideLines(input.template),
    "Return concise, conversion-focused copy that is platform-appropriate and avoids prohibited claims.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildImagePrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  brandProfile?: BrandRecord | null;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  copy: GeneratedCopyBundle;
  template?: TemplateRecord | null;
}): string {
  const imageGuide = getImageTypeGuide(input.imageType);
  const platformGuide = getPlatformStyle(input.platform);
  const categoryKey = normalizePromptCategory(input.category);
  const categoryLabel = categoryKey ? PRODUCT_CATEGORIES.find((item) => item.value === categoryKey)?.label.en ?? categoryKey : null;
  const scopedSellingPoints = shouldIncludeSellingPoints(input.imageType) ? input.sellingPoints : "";
  const scopedMaterialInfo = shouldIncludeMaterialInfo(input.imageType) ? input.materialInfo : "";
  const scopedSizeInfo = normalizeSizeInfoToDualUnits(input.sizeInfo);
  const allowMeasurementFocus = shouldIncludeSizeInfo(input.imageType);
  const highlightText = normalizePromptText(scopedSellingPoints) || normalizePromptText(input.copy.highlights.join(", "));

  return [
    `Edit the provided product image for a ${input.platform} listing in ${input.language} for market ${input.country}.`,
    "Keep the product identity, silhouette, materials, and recognizable shape consistent with the source image.",
    buildSimplifiedChineseOnlyLine(input.language),
    ...buildBrandOverrideLines(input.brandProfile),
    `Image type: ${input.imageType}. ${imageGuide.extraPrompt}`,
    `Target aspect ratio: ${input.ratio}. Aim for ${input.resolutionLabel} level fidelity.`,
    `Visual tone: ${platformGuide.tone}. Palette: ${platformGuide.palette}. Layout feel: ${platformGuide.layout}.`,
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
      ["Category", categoryLabel],
    ]),
    buildPromptFactLine([["Core product highlights", highlightText]]),
    buildPromptFactLine([["Additional product notes", input.sourceDescription]]),
    buildPromptFactLine([["Material information", scopedMaterialInfo]]),
    buildPromptFactLine([["Size and weight information", scopedSizeInfo]]),
    ...buildMeasurementPresentationLines({
      country: input.country,
      sizeInfo: input.sizeInfo,
      allowMeasurementFocus,
    }),
    shouldIncludeMaterialInfo(input.imageType)
      ? "Use the provided material details only inside this material-focused image."
      : "Do not display material copy in this image type.",
    allowMeasurementFocus
      ? "Use the provided size and weight details only inside this size/spec image."
      : scopedSizeInfo
        ? "Do not make size or weight the headline of this image type. If measurements appear at all, keep them in dual units."
        : "Do not display dimensions or weight in this image type.",
    shouldIncludeSellingPoints(input.imageType)
      ? "Use the provided selling points only in this feature-focused image."
      : "Do not inject the operator's selling-point text into this image type.",
    `Poster headline guidance: ${input.copy.posterHeadline}. Supporting subline: ${input.copy.posterSubline}.`,
    `Do not invent extra products, avoid distorted hands, avoid broken packaging, avoid unreadable text, avoid brand misuse.`,
    buildRestrictionsLine(input.restrictions),
    ...buildTemplateOverrideLines(input.template),
    `Optimized creative direction: ${input.copy.optimizedPrompt}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildPromptModePrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  brandProfile?: BrandRecord | null;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  customPrompt: string;
  customNegativePrompt?: string;
}) {
  const imageGuide = getImageTypeGuide(input.imageType);
  const platformGuide = getPlatformStyle(input.platform);
  const categoryKey = normalizePromptCategory(input.category);
  const categoryLabel = categoryKey ? PRODUCT_CATEGORIES.find((item) => item.value === categoryKey)?.label.en ?? categoryKey : null;
  const normalizedSizeInfo = normalizeSizeInfoToDualUnits(input.sizeInfo);
  const allowMeasurementFocus = shouldIncludeSizeInfo(input.imageType);

  return [
    `Edit the provided product image for a ${input.platform} listing in ${input.language} for market ${input.country}.`,
    "Keep the product identity, silhouette, materials, label placement, and recognizable shape consistent with the source image.",
    buildSimplifiedChineseOnlyLine(input.language),
    ...buildBrandOverrideLines(input.brandProfile),
    `Preferred image type: ${input.imageType}. ${imageGuide.extraPrompt}`,
    `Target aspect ratio: ${input.ratio}. Aim for ${input.resolutionLabel} level fidelity.`,
    `Visual tone: ${platformGuide.tone}. Palette: ${platformGuide.palette}. Layout feel: ${platformGuide.layout}.`,
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
      ["Category", categoryLabel],
    ]),
    buildPromptFactLine([["Selling points", input.sellingPoints]]),
    buildPromptFactLine([["Additional notes", input.sourceDescription]]),
    buildPromptFactLine([["Material information", input.materialInfo]]),
    buildPromptFactLine([["Size and weight information", normalizedSizeInfo]]),
    ...buildMeasurementPresentationLines({
      country: input.country,
      sizeInfo: input.sizeInfo,
      allowMeasurementFocus,
    }),
    buildRestrictionsLine(input.restrictions),
    `User creative prompt: ${input.customPrompt}`,
    input.customNegativePrompt?.trim()
      ? `Avoid these outcomes: ${input.customNegativePrompt.trim()}`
      : null,
    normalizedSizeInfo
      ? allowMeasurementFocus
        ? "If this prompt includes visible measurements, keep them in dual units and preserve shopping clarity."
        : "Do not make size or weight the main focus here. If measurements appear anywhere, keep them in dual units."
      : null,
    "Follow the user creative prompt closely while keeping the uploaded product visually accurate and commercially clean.",
  ]
    .filter(Boolean)
    .join("\n");
}

function strengthPrompt(referenceStrength: "reference" | "balanced" | "product") {
  if (referenceStrength === "reference") {
    return [
      "Prioritize a high-fidelity remake of the reference poster.",
      "Stay very close to the reference composition, text block positions, packaging relationship, background scene type, and decorative elements.",
    ];
  }

  if (referenceStrength === "product") {
    return [
      "Use the reference poster as a strong structural guide, but let the uploaded product remain the visual priority.",
      "If needed, relax some background or decoration details so the final poster feels more natural around the uploaded product.",
    ];
  }

  return [
    "Balance both goals: preserve the reference poster structure while adapting details so the uploaded product integrates naturally.",
  ];
}

function remakeGoalPrompt(referenceRemakeGoal: ReferenceRemakeGoal) {
  switch (referenceRemakeGoal) {
    case "soft-remake":
      return [
        "Remake goal: soft remake.",
        "Keep the same visual language, family feeling, and selling atmosphere as the reference, but allow measured local changes when they help the uploaded product fit naturally.",
      ];
    case "structure-remake":
      return [
        "Remake goal: structure remake.",
        "Prioritize the reference layout skeleton: camera relationship, framing, subject placement, whitespace logic, and module order must stay close, while textures and decorations may adapt.",
      ];
    case "semantic-remake":
      return [
        "Remake goal: semantic remake.",
        "Preserve the communication logic, selling hierarchy, and poster intent of the reference, but visual elements may adapt as long as the same message structure remains clear.",
      ];
    default:
      return [
        "Remake goal: hard remake.",
        "Keep the subject presentation, composition, lighting, background structure, and text-zone structure as close to the reference as possible.",
      ];
  }
}

function compositionLockPrompt(referenceCompositionLock: ReferenceCompositionLock) {
  switch (referenceCompositionLock) {
    case "strict":
      return [
        "Composition lock: strict.",
        "Do not change viewpoint, subject position, negative space, text-safe areas, or the overall framing logic except for unavoidable micro-corrections.",
      ];
    case "flexible":
      return [
        "Composition lock: flexible.",
        "Small composition adjustments are allowed when they help the uploaded product fit naturally, but the result must still feel clearly derived from the reference layout.",
      ];
    default:
      return [
        "Composition lock: balanced.",
        "Keep the original composition logic and layout zones, but allow small spatial adjustments if needed to fit the uploaded product cleanly.",
      ];
  }
}

function textRegionPolicyPrompt(referenceTextRegionPolicy: ReferenceTextRegionPolicy) {
  switch (referenceTextRegionPolicy) {
    case "leave-space":
      return [
        "Text region policy: leave-space.",
        "Preserve the main text-safe area and whitespace logic of the reference, but you do not need to replicate every original text block detail.",
      ];
    case "remove":
      return [
        "Text region policy: remove.",
        "You may remove the original text structure and prioritize a clean remake result, as long as the subject and overall composition still follow the chosen remake goal.",
      ];
    default:
      return [
        "Text region policy: preserve.",
        "Keep the original text block structure, block positions, and text-zone hierarchy of the reference whenever possible.",
      ];
  }
}

function buildReferenceTaskSpec(input: {
  referenceRemakeGoal: ReferenceRemakeGoal;
  referenceStrength: "reference" | "balanced" | "product";
  referenceCompositionLock: ReferenceCompositionLock;
  referenceCopyMode: ReferenceCopyMode;
  preserveReferenceText: boolean;
  referenceTextRegionPolicy: ReferenceTextRegionPolicy;
  referenceBackgroundMode: ReferenceBackgroundMode;
  ratio: string;
  resolutionLabel: string;
  variants: number;
  productName: string;
  brandName: string;
  sellingPoints: string;
  sourceDescription: string;
  referenceExtraPrompt?: string;
  referenceNegativePrompt?: string;
}) {
  return {
    task: {
      mode: "reference-remix",
      goal: input.referenceRemakeGoal,
      strength: input.referenceStrength,
      variants: input.variants,
    },
    locks: {
      composition: input.referenceCompositionLock,
      cameraAngle: input.referenceCompositionLock === "strict" ? "strict" : "follow-reference",
      lighting: "follow-reference",
      layout: input.referenceCompositionLock === "flexible" ? "adaptive" : "follow-reference",
    },
    textStrategy: {
      copySource: input.referenceCopyMode,
      preserveOriginalText: input.preserveReferenceText,
      textRegionPolicy: input.referenceTextRegionPolicy,
    },
    background: {
      mode: input.referenceBackgroundMode,
    },
    output: {
      aspectRatio: input.ratio,
      resolution: input.resolutionLabel,
    },
    inputs: {
      productName: input.productName || "",
      brandName: input.brandName || "",
      sellingPoints: input.sellingPoints || "",
      sourceDescription: input.sourceDescription || "",
      extraInstructions: input.referenceExtraPrompt || "",
      negativeConstraints: input.referenceNegativePrompt || "",
    },
  };
}

function nonEmptyList(values: string[]) {
  return values.filter((value) => value.trim().length > 0);
}

function splitCopySheetHighlights(value?: string | null, maxItems = 4) {
  return (value ?? "")
    .split(/[\n\r|,，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function buildReferenceRemakePrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  brandProfile?: BrandRecord | null;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  ratio: string;
  resolutionLabel: string;
  referenceStrength: "reference" | "balanced" | "product";
  referenceLayout: ReferenceLayoutAnalysis;
  remakeCopy: ReferencePosterCopy;
  promptVariant?: "strict" | "fallback";
}) {
  const isFallback = input.promptVariant === "fallback";
  const strengthLines = strengthPrompt(input.referenceStrength);
  const callouts = nonEmptyList(input.remakeCopy.callouts);
  const props = nonEmptyList(input.referenceLayout.supportingProps);
  const palette = nonEmptyList(input.referenceLayout.palette);
  const categoryKey = normalizePromptCategory(input.category);
  const categoryLabel = categoryKey ? PRODUCT_CATEGORIES.find((item) => item.value === categoryKey)?.label.en ?? categoryKey : null;

  return [
    `Create a remade e-commerce poster in ${input.language} for market ${input.country}.`,
    buildSimplifiedChineseOnlyLine(input.language),
    "Input order is fixed: the first uploaded image is the true product source image; the second uploaded image is the poster reference layout image.",
    "Use the first image only for product identity and visual truth: bottle shape, cap shape, label placement, material, transparency, reflections, and proportions.",
    "Use the second image as the poster blueprint: rebuild its composition, text zones, background type, packaging relationship, decorative props, and overall commercial poster feeling.",
    "This is a poster remake task, not a generic lifestyle scene generation task.",
    "Replace the original reference product completely with the uploaded product while keeping the poster structure as close as possible to the reference.",
    "Preserve the reference poster's top banner, main title area, subtitle area, bottom banner, and the relative placement between the main product and any packaging or secondary merchandise.",
    "Allow rebuilding extra supporting elements that appear in the reference poster, including packaging boxes, cups, icon badges, mountain scenery, surfaces, and decorative accents, as long as the uploaded product remains the hero.",
    ...strengthLines,
    ...buildBrandOverrideLines(input.brandProfile),
    `Reference poster summary: ${input.referenceLayout.summary}.`,
    `Poster style: ${input.referenceLayout.posterStyle}. Background type: ${input.referenceLayout.backgroundType}.`,
    `Main product placement: ${input.referenceLayout.primaryProductPlacement}.`,
    `Packaging present: ${input.referenceLayout.packagingPresent ? "yes" : "no"}.`,
    buildPromptFactLine([["Packaging placement", input.referenceLayout.packagingPlacement]]),
    buildPromptFactLine([["Product and packaging relationship", input.referenceLayout.productPackagingRelationship]]),
    `Camera angle: ${input.referenceLayout.cameraAngle}. Depth and lighting: ${input.referenceLayout.depthAndLighting}.`,
    `Palette cues: ${palette.length ? palette.join(", ") : "match the reference poster palette"}.`,
    `Supporting props to rebuild when helpful: ${props.length ? props.join(", ") : "follow the reference poster only"}.`,
    `Target aspect ratio: ${input.ratio}. Aim for ${input.resolutionLabel} fidelity.`,
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
      ["Category", categoryLabel],
      ["Platform", input.platform],
    ]),
    buildPromptFactLine([["Core selling points", input.sellingPoints]]),
    buildPromptFactLine([["Additional notes", input.sourceDescription]]),
    buildReferenceSlotTextLine("Top banner text", input.remakeCopy.topBanner),
    buildReferenceSlotTextLine("Headline text", input.remakeCopy.headline),
    buildReferenceSlotTextLine("Subheadline text", input.remakeCopy.subheadline),
    buildReferenceSlotTextLine("Bottom banner text", input.remakeCopy.bottomBanner),
    callouts.length ? `Callout texts: ${callouts.join(" | ")}.` : null,
    isFallback
      ? "Fallback mode: keep the same poster skeleton, block hierarchy, packaging relationship, and scene type, but simplify the visible text. Prefer short readable phrases or label-like banner text over long exact copy."
      : "If the reference poster includes marketplace-style text bars or Chinese-style poster blocks, recreate the same hierarchy and block placement with the new copy instead of inventing a fresh western ad layout.",
    isFallback
      ? "Prioritize these in order: product identity replacement, poster composition match, banner block preservation, packaging/prop relationship, readable short text."
      : "Prioritize these in order: product identity replacement, poster composition match, banner block preservation, packaging/prop relationship, accurate copy slot replacement.",
    "Do not turn this into a generic lifestyle poster unless the reference image itself is that kind of poster.",
    "Do not omit the packaging relationship, text bars, or poster structure if they are present in the reference.",
    buildRestrictionsLine(input.restrictions),
    isFallback
      ? "Avoid distorted packaging, duplicated products, wrong brand replacement, or missing banner blocks. If needed, reduce the amount of text but preserve the top banner, headline region, bottom banner, and overall poster framing."
      : "Avoid distorted packaging, unreadable core text, duplicated products, wrong brand replacement, or missing poster bars.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReferenceDirectRemakePrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  brandProfile?: BrandRecord | null;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  ratio: string;
  resolutionLabel: string;
  referenceRemakeGoal: ReferenceRemakeGoal;
  referenceStrength: "reference" | "balanced" | "product";
  referenceCompositionLock: ReferenceCompositionLock;
  referenceTextRegionPolicy: ReferenceTextRegionPolicy;
  referenceBackgroundMode: ReferenceBackgroundMode;
  preserveReferenceText: boolean;
  referenceCopyMode: ReferenceCopyMode;
  referenceExtraPrompt?: string;
  referenceNegativePrompt?: string;
  referenceLayoutHints?: ReferenceLayoutAnalysis | null;
  referencePosterCopyHints?: ReferencePosterCopy | null;
  promptVariant?: "strict" | "fallback";
  variants?: number;
}) {
  const copySheetHighlights = splitCopySheetHighlights(input.sellingPoints);
  const taskSpec = buildReferenceTaskSpec({
    referenceRemakeGoal: input.referenceRemakeGoal,
    referenceStrength: input.referenceStrength,
    referenceCompositionLock: input.referenceCompositionLock,
    referenceCopyMode: input.referenceCopyMode,
    preserveReferenceText: input.preserveReferenceText,
    referenceTextRegionPolicy: input.referenceTextRegionPolicy,
    referenceBackgroundMode: input.referenceBackgroundMode,
    ratio: input.ratio,
    resolutionLabel: input.resolutionLabel,
    variants: input.variants ?? 1,
    productName: input.productName,
    brandName: input.brandName,
    sellingPoints: input.sellingPoints,
    sourceDescription: input.sourceDescription,
    referenceExtraPrompt: input.referenceExtraPrompt,
    referenceNegativePrompt: input.referenceNegativePrompt,
  });
  const backgroundInstructions =
    input.referenceBackgroundMode === "simplify"
      ? [
          "Background mode: simplify.",
          "Keep the same background category and atmosphere as the reference, but remove secondary clutter and reduce visual noise if needed.",
        ]
      : input.referenceBackgroundMode === "regenerate"
        ? [
            "Background mode: regenerate.",
            "Rebuild a new background that preserves the reference scene logic and atmosphere, but it does not need to duplicate every original background detail.",
          ]
        : [
            "Background mode: preserve.",
            "Keep the reference background structure, environmental elements, and atmosphere as intact as possible.",
          ];
  const textPreservationInstructions = input.preserveReferenceText
    ? [
        "Text preservation: keep readable reference text whenever it still fits the replaced subject.",
        "Only change the minimum necessary text blocks.",
      ]
    : [
        "Text preservation: text may be rewritten where necessary.",
        "Keep the original layout roles, density, and visual hierarchy even when the wording changes.",
      ];

  return [
    "Strict reference remake task.",
    `Structured task spec (follow strictly): ${JSON.stringify(taskSpec)}.`,
    "Input order is fixed: image 1 is the true source image, image 2 is the reference master image.",
    "Use image 2 as the master blueprint and recreate it as faithfully as possible.",
    "Use image 1 only to replace the subject and every directly related element that belongs to that subject.",
    "That replacement includes the main product, packaging, labels, product-family variants, and any accessory, prop, badge, or graphic element that is clearly tied to the replaced subject.",
    "Keep everything else as unchanged as possible: composition, crop, framing, perspective, camera angle, background, lighting, atmosphere, scene type, text zones, banner bars, typography feel, color blocking, decorative elements, and overall poster hierarchy.",
    "Do not redesign, restyle, recompose, simplify, optimize, localize, or invent a new campaign idea.",
    "Do not change the ad logic, scene concept, visual style, layout system, or decoration language unless the subject replacement makes a tiny correction unavoidable.",
    "Use the first image only for visual truth: subject identity, shape, proportions, materials, texture, transparency, reflections, label placement, logo placement, and product-family cues.",
    ...remakeGoalPrompt(input.referenceRemakeGoal),
    ...strengthPrompt(input.referenceStrength),
    ...compositionLockPrompt(input.referenceCompositionLock),
    ...textRegionPolicyPrompt(input.referenceTextRegionPolicy),
    ...backgroundInstructions,
    ...textPreservationInstructions,
    input.referenceCopyMode === "copy-sheet"
      ? "Text source mode: copy-sheet. Keep the reference text layout, density, block positions, and typography feel, but rewrite only the content that should change."
      : "Text source mode: follow-reference. Preserve the reference image's original wording whenever possible and only make the smallest necessary text edits when the replaced subject would otherwise create an obvious conflict.",
    input.referenceCopyMode === "copy-sheet"
      ? "When rewriting text, prioritize the operator copy sheet fields first: product name, brand name, selling points, and additional notes."
      : "If the reference text is readable and still compatible with the replaced subject, keep it instead of rewriting it.",
    input.referenceCopyMode === "copy-sheet"
      ? "If the copy sheet is incomplete, infer the minimum necessary replacement wording from image 1 instead of inventing new marketing claims."
      : "If a text block must change, keep the same layout role, wording length, typography feel, and visual weight as the reference.",
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
      ["Category", normalizePromptCategory(input.category)],
    ]),
    input.referenceCopyMode === "copy-sheet"
      ? buildPromptFactLine([["Copy sheet selling points", copySheetHighlights.join(" | ")]])
      : null,
    input.referenceCopyMode === "copy-sheet"
      ? buildPromptFactLine([["Copy sheet notes", input.sourceDescription]])
      : null,
    input.referenceExtraPrompt ? `Extra instructions: ${input.referenceExtraPrompt}` : null,
    `Target aspect ratio: ${input.ratio}. Aim for ${input.resolutionLabel} fidelity.`,
    buildRestrictionsLine(input.restrictions),
    input.referenceNegativePrompt ? `Negative constraints: ${input.referenceNegativePrompt}` : null,
    "Priority order: 1) reference-image fidelity, 2) correct subject and related-element replacement from image 1, 3) preserve the original poster structure and text system.",
    "Avoid generic restyling, duplicated subjects, mismatched packaging, wrong labels, missing text blocks, missing banner bars, or any change that moves the result away from image 2.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReferenceRemixCopyBundle(input: {
  productName: string;
  brandName: string;
  sellingPoints: string;
  sourceDescription: string;
  referenceCopyMode: ReferenceCopyMode;
}): GeneratedCopyBundle {
  const highlights = splitCopySheetHighlights(input.sellingPoints);
  const optimizedPrompt =
    input.referenceCopyMode === "copy-sheet"
      ? [input.productName, input.brandName, highlights.join(" | "), input.sourceDescription].filter(Boolean).join(" · ")
      : "Strict reference remake";

  return {
    optimizedPrompt,
    title: input.productName,
    subtitle: input.referenceCopyMode === "copy-sheet" ? input.brandName || input.sourceDescription : "",
    highlights: input.referenceCopyMode === "copy-sheet" ? highlights : [],
    detailAngles: [],
    painPoints: [],
    cta: "",
    posterHeadline: input.productName,
    posterSubline: input.referenceCopyMode === "copy-sheet" ? input.sourceDescription : "",
  };
}

export function toGeneratedCopyBundleFromRemakePoster(copy: ReferencePosterCopy): GeneratedCopyBundle {
  return {
    optimizedPrompt: copy.summary || copy.headline || copy.subheadline || "",
    title: copy.headline || "",
    subtitle: copy.subheadline || "",
    highlights: nonEmptyList(copy.callouts),
    detailAngles: [],
    painPoints: [],
    cta: copy.bottomBanner || "",
    posterHeadline: copy.headline || "",
    posterSubline: copy.subheadline || "",
  };
}

export function buildPromptModeCopyBundle(input: {
  productName: string;
  customPrompt: string;
}): GeneratedCopyBundle {
  return {
    optimizedPrompt: input.customPrompt,
    title: input.productName,
    subtitle: "",
    highlights: [],
    detailAngles: [],
    painPoints: [],
    cta: "",
    posterHeadline: input.productName,
    posterSubline: "",
  };
}

export function getCountryLabel(code: string): string {
  return COUNTRIES.find((item) => item.value === code)?.label.en ?? code;
}

export function getLanguageLabel(code: string): string {
  return OUTPUT_LANGUAGES.find((item) => item.value === code)?.label.en ?? code;
}

export function getPlatformLabel(code: string): string {
  return PLATFORMS.find((item) => item.value === code)?.label.en ?? code;
}
