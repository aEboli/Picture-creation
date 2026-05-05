// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { COUNTRIES, OUTPUT_LANGUAGES, PLATFORMS, PRODUCT_CATEGORIES } from "./constants.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { appendQualityEnhancements } from "./prompt-quality-enhancements.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import type {
  BrandRecord,
  GeneratedCopyBundle,
  ImageType,
  ReferenceCopyMode,
  ReferenceLayoutAnalysis,
  ReferencePosterCopy,
} from "./types.ts";

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
    intent: "Produce a high-impact promotional poster creative with real advertising intent.",
    extraPrompt: "Use dramatic composition, strong hierarchy, and commercial ad staging. Avoid turning it into a plain background swap.",
    copyFocus: "Emphasize campaign energy with a strong hero message and short supporting copy.",
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
    intent: "Build a true copy-layout benefit image with one strong headline and up to two short selling-point lines.",
    extraPrompt: "Use a structured ad layout with disciplined whitespace, a clear product hero, and readable copy zones instead of infographic clutter.",
    copyFocus: "Turn the strongest benefits into a concise headline-led sales visual.",
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

function formatMeasurementNumberPrecise(value: number) {
  return value.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
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

function buildSlashDualMeasurementToken(value: number, unit: string) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (unit === "mm") {
    return `${formatMeasurementNumberPrecise(value)}mm/${formatMeasurementNumberPrecise(value / 25.4)}in`;
  }
  if (unit === "cm") {
    return `${formatMeasurementNumberPrecise(value)}cm/${formatMeasurementNumberPrecise(value / 2.54)}in`;
  }
  if (unit === "m") {
    return `${formatMeasurementNumberPrecise(value)}m/${formatMeasurementNumberPrecise(value * 3.28084)}ft`;
  }
  if (["inch", "inches", "in"].includes(unit)) {
    return `${formatMeasurementNumberPrecise(value * 2.54)}cm/${formatMeasurementNumberPrecise(value)}in`;
  }
  if (["ft", "feet"].includes(unit)) {
    return `${formatMeasurementNumberPrecise(value * 30.48)}cm/${formatMeasurementNumberPrecise(value)}ft`;
  }
  if (["kg", "kgs"].includes(unit)) {
    return `${formatMeasurementNumberPrecise(value)}kg/${formatMeasurementNumberPrecise(value * 2.20462)}lb`;
  }
  if (["g", "gram", "grams"].includes(unit)) {
    return `${formatMeasurementNumberPrecise(value)}g/${formatMeasurementNumberPrecise(value / 28.3495)}oz`;
  }
  if (["lb", "lbs"].includes(unit)) {
    return `${formatMeasurementNumberPrecise(value / 2.20462)}kg/${formatMeasurementNumberPrecise(value)}lb`;
  }
  if (["oz", "ounce", "ounces"].includes(unit)) {
    return `${formatMeasurementNumberPrecise(value * 28.3495)}g/${formatMeasurementNumberPrecise(value)}oz`;
  }

  return null;
}

function buildSortedSizeSpecVisualCopyLines(normalized: string, language: string) {
  const segments = normalized
    .split(/[，,;；\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => part.split(/[x×X*]/).map((segment) => segment.trim()).filter(Boolean));
  const labels = language.toLowerCase().startsWith("zh")
    ? { length: "长", width: "宽", height: "高", weight: "重量" }
    : { length: "Length", width: "Width", height: "Height", weight: "Weight" };

  const dimensions: Array<{ value: number; unit: string }> = [];
  const weights: string[] = [];
  let pendingDimensionValues: number[] = [];

  for (const segment of segments) {
    const match = segment.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|ft|feet|kg|kgs|g|grams|gram|lb|lbs|oz|ounce|ounces)\b/i);
    if (!match) {
      const nakedNumber = segment.match(/^(\d+(?:\.\d+)?)$/);
      if (nakedNumber) {
        pendingDimensionValues.push(Number(nakedNumber[1]));
      }
      continue;
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const isWeight = ["kg", "kgs", "g", "gram", "grams", "lb", "lbs", "oz", "ounce", "ounces"].includes(unit);
    if (isWeight) {
      const rendered = buildSlashDualMeasurementToken(value, unit);
      if (rendered) {
        weights.push(`${labels.weight} ${rendered}`);
      }
      continue;
    }

    const dimensionValues = [...pendingDimensionValues, value];
    pendingDimensionValues = [];
    dimensions.push(...dimensionValues.map((dimensionValue) => ({ value: dimensionValue, unit })));
  }

  const sortedDimensions = [...dimensions].sort((left, right) => right.value - left.value);
  const lines: string[] = [];

  if (sortedDimensions.length >= 1) {
    const rendered = buildSlashDualMeasurementToken(sortedDimensions[0]!.value, sortedDimensions[0]!.unit);
    if (rendered) {
      lines.push(`${labels.length} ${rendered}`);
    }
  }

  if (sortedDimensions.length >= 3) {
    const rendered = buildSlashDualMeasurementToken(sortedDimensions[1]!.value, sortedDimensions[1]!.unit);
    if (rendered) {
      lines.push(`${labels.height} ${rendered}`);
    }
  }

  if (sortedDimensions.length >= 2) {
    const rendered = buildSlashDualMeasurementToken(sortedDimensions[sortedDimensions.length - 1]!.value, sortedDimensions[sortedDimensions.length - 1]!.unit);
    if (rendered) {
      lines.push(`${labels.width} ${rendered}`);
    }
  }

  return [...lines, ...weights];
}

export function buildSizeSpecVisualCopyLines(input: {
  sizeInfo?: string | null;
  language: string;
}) {
  const normalized = normalizePromptText(input.sizeInfo);
  if (!normalized) {
    return [];
  }

  return buildSortedSizeSpecVisualCopyLines(normalized, input.language);
  /*

  const segments = normalized
    .split(/[，,;；\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => part.split(/[x×X*]/).map((segment) => segment.trim()).filter(Boolean));
  const dimensionLabels = input.language.toLowerCase().startsWith("zh")
    ? ["长", "宽", "高"]
    : ["Length", "Width", "Height"];
  const weightLabel = input.language.toLowerCase().startsWith("zh") ? "重量" : "Weight";
  let dimensionIndex = 0;
  let pendingDimensionValues: number[] = [];

  return segments.flatMap((segment) => {
    const match = segment.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m|inches|inch|in|ft|feet|kg|kgs|g|grams|gram|lb|lbs|oz|ounce|ounces)\b/i);
    if (!match) {
      const nakedNumber = segment.match(/^(\d+(?:\.\d+)?)$/);
      if (nakedNumber) {
        pendingDimensionValues.push(Number(nakedNumber[1]));
      }
      return [];
    }

    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    const isWeight = ["kg", "kgs", "g", "gram", "grams", "lb", "lbs", "oz", "ounce", "ounces"].includes(unit);
    if (isWeight) {
      const rendered = buildSlashDualMeasurementToken(value, unit);
      if (!rendered) {
        return [];
      }
      return [`${weightLabel} ${rendered}`];
    }

    const dimensionValues = [...pendingDimensionValues, value];
    pendingDimensionValues = [];

    return dimensionValues.flatMap((dimensionValue) => {
      const rendered = buildSlashDualMeasurementToken(dimensionValue, unit);
      if (!rendered) {
        return [];
      }

      const label = dimensionLabels[Math.min(dimensionIndex, dimensionLabels.length - 1)]!;
      dimensionIndex += 1;
      return [`${label} ${rendered}`];
    });
  });
  */
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
  hasSourceImages: boolean;
}) {
  const promptText = input.customPrompt.trim();

  return appendQualityEnhancements({
    promptText,
    context: {
      mode: "prompt",
      language: input.language,
      category: "",
      imageType: input.imageType,
    },
  });
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
