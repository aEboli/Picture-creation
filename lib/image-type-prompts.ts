import { IMAGE_TYPE_OPTIONS } from "./constants";
import type { CreationMode, ImageType, UiLanguage } from "./types";

export type ImageTypePromptMode = Extract<CreationMode, "standard" | "suite" | "amazon-a-plus">;

export type ImageTypePromptOverrides = Partial<Record<ImageTypePromptMode, Partial<Record<string, string>>>>;

export const IMAGE_TYPE_PROMPT_MODES = ["standard", "suite", "amazon-a-plus"] as const;

export const IMAGE_TYPE_PROMPT_MODE_TYPES: Record<ImageTypePromptMode, readonly ImageType[]> = {
  standard: [
    "main-image",
    "lifestyle",
    "scene",
    "white-background",
    "model",
    "poster",
    "detail",
    "pain-point",
    "feature-overview",
    "material-craft",
    "size-spec",
    "multi-scene",
    "culture-value",
  ],
  suite: ["main-image", "lifestyle", "feature-overview", "scene", "material-craft", "size-spec"],
  "amazon-a-plus": ["poster", "feature-overview", "multi-scene", "detail", "size-spec", "culture-value"],
};

const SYSTEM_PROMPT_FOUNDATION =
  "System-level foundation: preserve the supplied subject identity, follow user-provided brand, language, platform, aspect ratio, and restriction inputs, keep guidance reusable across product categories, and avoid unsupported claims, misleading edits, or text-heavy clutter.";

const SUBJECT_CATEGORY_ANALYSIS_DIRECTIVE =
  "Subject and category analysis: before composing the image, analyze the supplied subject, infer the most specific category from the name, source image, description, materials, size, and selling points, then use that category judgment to choose scene logic, visual proof, styling, scale cues, and risk controls. Do not render the analysis as visible text unless the user explicitly asks for labels.";

const BASE_IMAGE_TYPE_PROMPTS: Record<ImageType, string> = {
  "main-image":
    "Section directive: center the primary subject with accurate form, color, scale, materials, and visible key details; use a clear lead-image composition that works for any product, object, or offer.",
  lifestyle:
    "Section directive: place the subject in a plausible real-life use context with people, environment, or gestures only when they clarify value; keep the scene natural and the subject easy to identify.",
  scene:
    "Section directive: build a believable contextual scene around the subject, matching the intended setting and mood while keeping the subject as the visual anchor.",
  "white-background":
    "Section directive: use an uncluttered white or near-white background; preserve exact edges, proportions, shadows, and surface finish so the result reads as a clear catalog image.",
  model:
    "Section directive: show human use, scale, fit, handling, or wear only when relevant; make model styling inclusive and market-appropriate while keeping the subject unchanged.",
  poster:
    "Section directive: create a campaign-style visual with strong hierarchy, deliberate negative space, and optional copy zones; keep advertising energy without obscuring the subject.",
  detail:
    "Section directive: focus on close-up evidence of features, texture, construction, interface, or craftsmanship; crop tightly but retain enough context to understand the subject.",
  "pain-point":
    "Section directive: represent the user problem, friction, or before-and-after contrast clearly, then make the product or solution role obvious without exaggerated or misleading claims.",
  "feature-overview":
    "Section directive: organize the strongest benefits into a clear visual layout with one primary message and a few short support points; prioritize legibility and hierarchy over decoration.",
  "material-craft":
    "Section directive: emphasize materials, finish, build quality, joints, texture, and manufacturing cues; use lighting and composition that make physical quality credible.",
  "size-spec":
    "Section directive: communicate scale, dimensions, capacity, quantity, or fit with clean measurement guides, labels, or comparison references; keep all visible specs consistent with supplied data.",
  "multi-scene":
    "Section directive: combine multiple distinct use cases or contexts into one coherent module; separate scenes clearly while keeping identity, color, and proportions consistent.",
  "culture-value":
    "Section directive: express the broader lifestyle, emotional, cultural, or identity value of the subject through setting, styling, symbols, and atmosphere; avoid stereotypes and keep product relevance clear.",
};

const MODE_PROMPT_PREFIX: Record<ImageTypePromptMode, string> = {
  standard: "Mode directive: create one self-contained image that fulfills the selected section's role.",
  suite: "Mode directive: create this section as one coherent part of a complete image set, keeping shared identity consistent while giving this slot a distinct purpose.",
  "amazon-a-plus": "Mode directive: create this section as a detail-page content module that informs shoppers, supports comparison, and remains readable in a retail layout.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function getImageTypePromptTypes(mode: ImageTypePromptMode): readonly ImageType[] {
  return IMAGE_TYPE_PROMPT_MODE_TYPES[mode];
}

export function getImageTypeLabel(imageType: string, language: UiLanguage): string {
  return IMAGE_TYPE_OPTIONS.find((option) => option.value === imageType)?.label[language] ?? imageType;
}

export function getDefaultImageTypePrompt(mode: ImageTypePromptMode, imageType: string): string {
  const typedImageType = imageType as ImageType;
  const basePrompt =
    BASE_IMAGE_TYPE_PROMPTS[typedImageType] ??
    `Section directive: create a generally useful ${imageType} image with clear subject identity and practical visual hierarchy.`;
  return `${SYSTEM_PROMPT_FOUNDATION} ${SUBJECT_CATEGORY_ANALYSIS_DIRECTIVE} ${MODE_PROMPT_PREFIX[mode]} ${basePrompt}`;
}

export function normalizeImageTypePromptOverrides(input: unknown): ImageTypePromptOverrides {
  if (!isRecord(input)) {
    return {};
  }

  const normalized: ImageTypePromptOverrides = {};

  for (const mode of IMAGE_TYPE_PROMPT_MODES) {
    const modeInput = input[mode];
    if (!isRecord(modeInput)) {
      continue;
    }

    const allowedTypes = new Set(IMAGE_TYPE_PROMPT_MODE_TYPES[mode]);
    const modeOverrides: Record<string, string> = {};

    for (const [imageType, prompt] of Object.entries(modeInput)) {
      if (!allowedTypes.has(imageType as ImageType) || typeof prompt !== "string") {
        continue;
      }

      modeOverrides[imageType] = prompt.trim();
    }

    if (Object.keys(modeOverrides).length > 0) {
      normalized[mode] = modeOverrides;
    }
  }

  return normalized;
}

export function parseImageTypePromptOverrides(json?: string | null): ImageTypePromptOverrides {
  if (!json?.trim()) {
    return {};
  }

  return normalizeImageTypePromptOverrides(JSON.parse(json));
}

export function serializeImageTypePromptOverrides(overrides: ImageTypePromptOverrides): string {
  return JSON.stringify(normalizeImageTypePromptOverrides(overrides), null, 2);
}

export function resolveImageTypePrompt(input: {
  overridesJson?: string | null;
  mode: ImageTypePromptMode;
  imageType: string;
}): string {
  const overrides = parseImageTypePromptOverrides(input.overridesJson);
  const customPrompt = overrides[input.mode]?.[input.imageType]?.trim();
  return customPrompt || getDefaultImageTypePrompt(input.mode, input.imageType);
}
