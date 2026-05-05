import type { CreationMode, ImageType } from "./types.ts";

export type QualityEnhancementCategory =
  | "base_quality"
  | "camera_and_lens"
  | "lighting"
  | "materials_and_details"
  | "color_and_post_processing";

type QualityEnhancementProfile = "hero" | "detail" | "scene" | "generic";
type QualitySupportedMode = Extract<CreationMode, "standard" | "suite" | "amazon-a-plus" | "prompt">;

export interface QualityEnhancementKeyword {
  id: string;
  category: QualityEnhancementCategory;
  keywordEn: string;
  keywordZh: string;
  description: string;
  appliesTo: QualityEnhancementProfile[];
  conflictsWith: string[];
  priority: number;
}

export interface QualityEnhancementSelectionContext {
  mode: QualitySupportedMode;
  language: string;
  category?: string;
  imageType?: ImageType | string;
  promptText?: string;
}

const ENGLISH_LANGUAGE_PREFIXES = ["en-"];
const NON_TRANSLATED_LANGUAGE_PREFIXES = ["de-", "fr-", "ja-", "ko-", "es-", "pt-"];

export const QUALITY_ENHANCEMENT_KEYWORDS: QualityEnhancementKeyword[] = [
  {
    id: "best-quality",
    category: "base_quality",
    keywordEn: "best quality",
    keywordZh: "最佳质量",
    description: "最佳质量",
    appliesTo: ["hero", "detail", "scene", "generic"],
    conflictsWith: [],
    priority: 10,
  },
  {
    id: "ultra-high-definition",
    category: "base_quality",
    keywordEn: "ultra-high definition",
    keywordZh: "超高清",
    description: "超高清",
    appliesTo: ["hero", "detail", "scene", "generic"],
    conflictsWith: [],
    priority: 20,
  },
  {
    id: "extreme-detail",
    category: "base_quality",
    keywordEn: "extreme detail",
    keywordZh: "极致细节",
    description: "极致细节",
    appliesTo: ["hero", "detail", "scene", "generic"],
    conflictsWith: [],
    priority: 30,
  },
  {
    id: "highly-detailed",
    category: "base_quality",
    keywordEn: "highly detailed",
    keywordZh: "高度精细",
    description: "高度详细",
    appliesTo: ["detail", "generic"],
    conflictsWith: [],
    priority: 40,
  },
  {
    id: "masterpiece",
    category: "base_quality",
    keywordEn: "masterpiece",
    keywordZh: "杰作级画质",
    description: "杰作/极致画质锚点",
    appliesTo: ["hero", "generic"],
    conflictsWith: [],
    priority: 50,
  },
  {
    id: "8k-resolution",
    category: "base_quality",
    keywordEn: "8k resolution",
    keywordZh: "8K分辨率",
    description: "8K分辨率",
    appliesTo: ["hero", "detail"],
    conflictsWith: [],
    priority: 60,
  },
  {
    id: "intricate-details",
    category: "base_quality",
    keywordEn: "intricate details",
    keywordZh: "复杂细节",
    description: "错综复杂的细节",
    appliesTo: ["detail", "generic"],
    conflictsWith: [],
    priority: 70,
  },
  {
    id: "raw-photo",
    category: "camera_and_lens",
    keywordEn: "RAW photo",
    keywordZh: "RAW照片质感",
    description: "RAW格式无损照片",
    appliesTo: ["hero", "detail", "scene", "generic"],
    conflictsWith: [],
    priority: 10,
  },
  {
    id: "shot-on-dslr",
    category: "camera_and_lens",
    keywordEn: "shot on DSLR",
    keywordZh: "单反拍摄质感",
    description: "单反拍摄感",
    appliesTo: ["hero", "detail", "scene", "generic"],
    conflictsWith: ["hasselblad"],
    priority: 20,
  },
  {
    id: "hasselblad",
    category: "camera_and_lens",
    keywordEn: "Hasselblad",
    keywordZh: "哈苏色彩质感",
    description: "哈苏相机色彩与质感",
    appliesTo: ["hero", "generic"],
    conflictsWith: ["shot-on-dslr"],
    priority: 30,
  },
  {
    id: "macro-lens",
    category: "camera_and_lens",
    keywordEn: "macro lens",
    keywordZh: "微距镜头",
    description: "微距镜头",
    appliesTo: ["detail"],
    conflictsWith: [],
    priority: 40,
  },
  {
    id: "85mm-lens",
    category: "camera_and_lens",
    keywordEn: "85mm lens",
    keywordZh: "85毫米镜头",
    description: "85毫米镜头",
    appliesTo: ["hero", "scene"],
    conflictsWith: ["macro-lens"],
    priority: 50,
  },
  {
    id: "sharp-focus",
    category: "camera_and_lens",
    keywordEn: "sharp focus",
    keywordZh: "锐利对焦",
    description: "锐利对焦",
    appliesTo: ["hero", "detail", "generic"],
    conflictsWith: [],
    priority: 60,
  },
  {
    id: "shallow-depth-of-field",
    category: "camera_and_lens",
    keywordEn: "shallow depth of field",
    keywordZh: "浅景深",
    description: "浅景深",
    appliesTo: ["hero", "scene"],
    conflictsWith: ["f-8"],
    priority: 70,
  },
  {
    id: "f-1-8",
    category: "camera_and_lens",
    keywordEn: "f/1.8",
    keywordZh: "f/1.8大光圈",
    description: "大光圈",
    appliesTo: ["hero", "scene"],
    conflictsWith: ["f-8"],
    priority: 80,
  },
  {
    id: "f-8",
    category: "camera_and_lens",
    keywordEn: "f/8",
    keywordZh: "f/8中等光圈",
    description: "中等光圈",
    appliesTo: ["detail"],
    conflictsWith: ["shallow-depth-of-field", "f-1-8"],
    priority: 90,
  },
  {
    id: "studio-lighting",
    category: "lighting",
    keywordEn: "studio lighting",
    keywordZh: "影棚布光",
    description: "影棚光",
    appliesTo: ["hero", "detail", "generic"],
    conflictsWith: [],
    priority: 10,
  },
  {
    id: "softbox-lighting",
    category: "lighting",
    keywordEn: "softbox lighting",
    keywordZh: "柔光箱照明",
    description: "柔光箱",
    appliesTo: ["hero", "generic"],
    conflictsWith: [],
    priority: 20,
  },
  {
    id: "hard-directional-lighting",
    category: "lighting",
    keywordEn: "hard directional lighting",
    keywordZh: "硬质方向光",
    description: "硬质方向光",
    appliesTo: ["detail"],
    conflictsWith: [],
    priority: 30,
  },
  {
    id: "rim-lighting",
    category: "lighting",
    keywordEn: "rim lighting",
    keywordZh: "轮廓光",
    description: "轮廓光",
    appliesTo: ["hero", "scene"],
    conflictsWith: [],
    priority: 40,
  },
  {
    id: "cinematic-lighting",
    category: "lighting",
    keywordEn: "cinematic lighting",
    keywordZh: "电影级光影",
    description: "电影级光影",
    appliesTo: ["scene", "hero"],
    conflictsWith: [],
    priority: 50,
  },
  {
    id: "volumetric-lighting",
    category: "lighting",
    keywordEn: "volumetric lighting",
    keywordZh: "体积光",
    description: "体积光",
    appliesTo: ["scene"],
    conflictsWith: [],
    priority: 60,
  },
  {
    id: "hyper-realistic-textures",
    category: "materials_and_details",
    keywordEn: "hyper-realistic textures",
    keywordZh: "超真实纹理",
    description: "超真实纹理",
    appliesTo: ["detail", "generic"],
    conflictsWith: [],
    priority: 10,
  },
  {
    id: "tactile-texture",
    category: "materials_and_details",
    keywordEn: "tactile texture",
    keywordZh: "触感纹理",
    description: "触觉纹理",
    appliesTo: ["detail", "generic"],
    conflictsWith: [],
    priority: 20,
  },
  {
    id: "microscopic-details",
    category: "materials_and_details",
    keywordEn: "microscopic details",
    keywordZh: "微观细节",
    description: "微观细节",
    appliesTo: ["detail"],
    conflictsWith: [],
    priority: 30,
  },
  {
    id: "physically-based-rendering",
    category: "materials_and_details",
    keywordEn: "physically based rendering",
    keywordZh: "基于物理的真实材质",
    description: "基于物理的渲染",
    appliesTo: ["detail", "generic"],
    conflictsWith: [],
    priority: 40,
  },
  {
    id: "visible-pores",
    category: "materials_and_details",
    keywordEn: "visible pores",
    keywordZh: "可见毛孔",
    description: "可见毛孔",
    appliesTo: ["scene"],
    conflictsWith: [],
    priority: 50,
  },
  {
    id: "visible-fibers",
    category: "materials_and_details",
    keywordEn: "visible fibers",
    keywordZh: "可见纤维",
    description: "可见纤维",
    appliesTo: ["detail"],
    conflictsWith: [],
    priority: 60,
  },
  {
    id: "subtle-imperfections",
    category: "materials_and_details",
    keywordEn: "subtle imperfections",
    keywordZh: "细微瑕疵",
    description: "细微瑕疵",
    appliesTo: ["hero", "detail", "scene"],
    conflictsWith: [],
    priority: 70,
  },
  {
    id: "specular-highlights",
    category: "materials_and_details",
    keywordEn: "specular highlights",
    keywordZh: "镜面高光",
    description: "镜面高光",
    appliesTo: ["detail", "hero"],
    conflictsWith: ["matte-finish"],
    priority: 80,
  },
  {
    id: "matte-finish",
    category: "materials_and_details",
    keywordEn: "matte finish",
    keywordZh: "哑光质感",
    description: "哑光表面质感",
    appliesTo: ["detail", "hero"],
    conflictsWith: ["specular-highlights"],
    priority: 90,
  },
  {
    id: "color-grading",
    category: "color_and_post_processing",
    keywordEn: "color grading",
    keywordZh: "色彩分级",
    description: "色彩分级",
    appliesTo: ["hero", "scene", "generic"],
    conflictsWith: [],
    priority: 10,
  },
  {
    id: "hdr",
    category: "color_and_post_processing",
    keywordEn: "HDR",
    keywordZh: "HDR高动态范围",
    description: "高动态范围",
    appliesTo: ["hero", "scene", "generic"],
    conflictsWith: [],
    priority: 20,
  },
  {
    id: "vibrant-colors",
    category: "color_and_post_processing",
    keywordEn: "vibrant colors",
    keywordZh: "鲜明色彩",
    description: "鲜艳的色彩",
    appliesTo: ["hero", "scene"],
    conflictsWith: ["muted-colors"],
    priority: 30,
  },
  {
    id: "muted-colors",
    category: "color_and_post_processing",
    keywordEn: "muted colors",
    keywordZh: "低饱和柔和色调",
    description: "柔和低饱和度",
    appliesTo: ["hero", "scene"],
    conflictsWith: ["vibrant-colors"],
    priority: 40,
  },
  {
    id: "high-contrast",
    category: "color_and_post_processing",
    keywordEn: "high contrast",
    keywordZh: "高对比度",
    description: "高对比度",
    appliesTo: ["hero", "scene", "generic"],
    conflictsWith: [],
    priority: 50,
  },
  {
    id: "film-grain",
    category: "color_and_post_processing",
    keywordEn: "film grain",
    keywordZh: "胶片颗粒",
    description: "胶片颗粒",
    appliesTo: ["scene"],
    conflictsWith: [],
    priority: 60,
  },
];

const QUALITY_KEYWORD_INDEX = new Map(QUALITY_ENHANCEMENT_KEYWORDS.map((item) => [item.id, item] as const));

const PROFILE_BLUEPRINTS: Record<
  QualityEnhancementProfile,
  {
    base: string[];
    cameraPrimary: string[];
    cameraSecondary?: string[];
    lighting: string[];
    finisher: string[];
    supplements: string[];
  }
> = {
  hero: {
    base: ["best-quality"],
    cameraPrimary: ["raw-photo"],
    cameraSecondary: ["hasselblad", "shot-on-dslr"],
    lighting: ["softbox-lighting", "rim-lighting", "studio-lighting"],
    finisher: ["color-grading", "high-contrast", "hdr"],
    supplements: ["ultra-high-definition", "vibrant-colors", "shallow-depth-of-field", "f-1-8"],
  },
  detail: {
    base: ["extreme-detail"],
    cameraPrimary: ["macro-lens"],
    lighting: ["hard-directional-lighting", "studio-lighting"],
    finisher: ["hyper-realistic-textures", "microscopic-details", "physically-based-rendering"],
    supplements: ["sharp-focus", "f-8", "specular-highlights", "tactile-texture", "visible-fibers", "matte-finish"],
  },
  scene: {
    base: ["best-quality"],
    cameraPrimary: ["raw-photo", "shallow-depth-of-field", "85mm-lens"],
    lighting: ["cinematic-lighting", "volumetric-lighting", "rim-lighting"],
    finisher: ["color-grading", "hdr", "film-grain"],
    supplements: ["muted-colors", "vibrant-colors", "f-1-8"],
  },
  generic: {
    base: ["best-quality"],
    cameraPrimary: ["raw-photo", "shot-on-dslr", "sharp-focus"],
    lighting: ["studio-lighting", "softbox-lighting"],
    finisher: ["hdr", "color-grading", "hyper-realistic-textures"],
    supplements: ["ultra-high-definition", "high-contrast", "tactile-texture"],
  },
};

function isChineseLanguage(language: string) {
  return language.toLowerCase() === "zh-cn";
}

function isEnglishLanguage(language: string) {
  const lower = language.toLowerCase();
  return ENGLISH_LANGUAGE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function shouldUseEnglishFallback(language: string) {
  const lower = language.toLowerCase();
  return NON_TRANSLATED_LANGUAGE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function localizeKeyword(keyword: QualityEnhancementKeyword, language: string) {
  if (isChineseLanguage(language)) {
    return keyword.keywordZh;
  }

  if (isEnglishLanguage(language) || shouldUseEnglishFallback(language)) {
    return keyword.keywordEn;
  }

  return keyword.keywordEn;
}

function normalizeCategory(category?: string) {
  const lower = (category ?? "").trim().toLowerCase();

  if (!lower) {
    return "generic";
  }
  if (/outdoor|fishing|lure|swimbait/.test(lower)) {
    return "outdoor";
  }
  if (/beauty|skincare|skin care|cosmetic/.test(lower)) {
    return "beauty";
  }
  if (/fashion|apparel|clothing|garment/.test(lower)) {
    return "fashion";
  }

  return "generic";
}

function inferProfile(context: QualityEnhancementSelectionContext): QualityEnhancementProfile {
  const imageTypeText = (context.imageType ?? "").toString().toLowerCase();
  const promptText = (context.promptText ?? "").toLowerCase();

  if (context.mode === "prompt" && /macro|detail|close-up|close up|texture|material|微距|细节|特写|材质|纹理/.test(promptText)) {
    return "detail";
  }
  if (context.mode === "prompt" && /hero|poster|campaign|ad\b|advert|banner|主视觉|海报|广告/.test(promptText)) {
    return "hero";
  }
  if (/detail|hook|hardware|macro|material|craft|size|spec/.test(imageTypeText)) {
    return "detail";
  }
  if (/scene|lifestyle|water|multi-scene|culture|use/.test(imageTypeText)) {
    return "scene";
  }
  if (/action|motion|swim/.test(imageTypeText)) {
    return "generic";
  }
  if (context.mode === "prompt" && /hero|poster|campaign|ad\b|advert|banner|主视觉|海报|广告/.test(promptText)) {
    return "hero";
  }

  return context.mode === "prompt" ? "generic" : "hero";
}

function getBlueprint(context: QualityEnhancementSelectionContext) {
  const profile = inferProfile(context);
  const category = normalizeCategory(context.category);
  const blueprint = PROFILE_BLUEPRINTS[profile];

  if (category === "outdoor" && profile === "detail") {
    return {
      ...blueprint,
      supplements: ["sharp-focus", "f-8", "specular-highlights", ...blueprint.supplements],
    };
  }

  if (category === "outdoor" && profile === "hero") {
    return {
      ...blueprint,
      finisher: ["high-contrast", ...blueprint.finisher],
    };
  }

  if (category === "beauty") {
    return {
      ...blueprint,
      lighting: ["softbox-lighting", ...blueprint.lighting],
      finisher: profile === "detail" ? ["hyper-realistic-textures", ...blueprint.finisher] : ["hdr", ...blueprint.finisher],
      supplements: ["subtle-imperfections", ...blueprint.supplements],
    };
  }

  if (category === "fashion" && profile === "detail") {
    return {
      ...blueprint,
      finisher: ["visible-fibers", "tactile-texture", ...blueprint.finisher],
    };
  }

  if (category === "fashion" && profile === "hero") {
    return {
      ...blueprint,
      supplements: ["85mm-lens", "muted-colors", ...blueprint.supplements],
    };
  }

  return blueprint;
}

function getKeywordById(id: string) {
  return QUALITY_KEYWORD_INDEX.get(id) ?? null;
}

function normalizePromptText(promptText?: string) {
  return (promptText ?? "").toLowerCase();
}

function promptContainsKeyword(promptText: string, keyword: QualityEnhancementKeyword) {
  const normalized = normalizePromptText(promptText);
  return normalized.includes(keyword.keywordEn.toLowerCase()) || normalized.includes(keyword.keywordZh.toLowerCase());
}

function collectExistingKeywordIds(promptText?: string) {
  const normalized = normalizePromptText(promptText);
  const ids = new Set<string>();

  for (const keyword of QUALITY_ENHANCEMENT_KEYWORDS) {
    if (normalized.includes(keyword.keywordEn.toLowerCase()) || normalized.includes(keyword.keywordZh.toLowerCase())) {
      ids.add(keyword.id);
    }
  }

  return ids;
}

function canUseKeyword(
  keyword: QualityEnhancementKeyword,
  selected: QualityEnhancementKeyword[],
  existingIds: Set<string>,
  promptText: string,
  allowDuplicateCategory = false,
) {
  if (existingIds.has(keyword.id) || promptContainsKeyword(promptText, keyword)) {
    return false;
  }

  if (selected.some((item) => item.id === keyword.id)) {
    return false;
  }

  if (!allowDuplicateCategory && selected.some((item) => item.category === keyword.category) && keyword.category !== "base_quality") {
    return false;
  }

  if (selected.some((item) => item.conflictsWith.includes(keyword.id) || keyword.conflictsWith.includes(item.id))) {
    return false;
  }

  return true;
}

function addFromIds(
  ids: string[],
  limit: number,
  state: {
    selected: QualityEnhancementKeyword[];
    existingIds: Set<string>;
    promptText: string;
  },
  options: {
    allowDuplicateCategory?: boolean;
  } = {},
) {
  for (const id of ids) {
    if (state.selected.length >= limit) {
      break;
    }

    const keyword = getKeywordById(id);
    if (!keyword) {
      continue;
    }

    if (!canUseKeyword(keyword, state.selected, state.existingIds, state.promptText, options.allowDuplicateCategory)) {
      continue;
    }

    state.selected.push(keyword);
  }
}

function sortRemainingKeywords(profile: QualityEnhancementProfile) {
  return QUALITY_ENHANCEMENT_KEYWORDS
    .filter((keyword) => keyword.appliesTo.includes(profile))
    .sort((left, right) => left.priority - right.priority);
}

export function selectQualityEnhancementKeywords(
  context: QualityEnhancementSelectionContext,
): QualityEnhancementKeyword[] {
  const profile = inferProfile(context);
  const blueprint = getBlueprint(context);
  const promptText = context.promptText ?? "";
  const existingIds = collectExistingKeywordIds(promptText);
  const selected: QualityEnhancementKeyword[] = [];
  const totalExisting = existingIds.size;
  const desiredCount = profile === "hero" ? 5 : 4;
  const targetCount = totalExisting >= desiredCount ? 0 : desiredCount - totalExisting;
  const state = { selected, existingIds, promptText };

  if (targetCount <= 0) {
    return [];
  }

  addFromIds(blueprint.base, Math.min(targetCount, 1), state);
  addFromIds(blueprint.cameraPrimary, Math.min(targetCount, 2), state);
  if (profile === "hero" && blueprint.cameraSecondary?.length) {
    addFromIds(blueprint.cameraSecondary, Math.min(targetCount, 3), state, {
      allowDuplicateCategory: true,
    });
  }
  addFromIds(blueprint.lighting, Math.min(targetCount, profile === "hero" ? 4 : 3), state);
  addFromIds(blueprint.finisher, Math.min(targetCount, profile === "hero" ? 5 : 4), state);

  if (profile === "detail") {
    addFromIds(blueprint.supplements, Math.min(targetCount + 1, 5), state, {
      allowDuplicateCategory: true,
    });
  }

  if (state.selected.length < targetCount) {
    addFromIds(blueprint.supplements, targetCount, state);
  }

  if (state.selected.length < 3) {
    const remainingIds = sortRemainingKeywords(profile).map((keyword) => keyword.id);
    addFromIds(remainingIds, 3, state);
  }

  return state.selected.slice(0, 5);
}

export function buildQualityEnhancementLine(
  keywords: QualityEnhancementKeyword[],
  language: string,
) {
  if (keywords.length === 0) {
    return "";
  }

  const localizedKeywords = keywords.map((keyword) => localizeKeyword(keyword, language));
  if (isChineseLanguage(language)) {
    return `画质强化：${localizedKeywords.join("、")}。`;
  }

  return `Quality emphasis: ${localizedKeywords.join(", ")}.`;
}

function hasExistingQualityLine(promptText: string) {
  return /(^|\n)(Quality emphasis:|画质强化：)/.test(promptText);
}

export function appendQualityEnhancements(input: {
  promptText: string;
  context: Omit<QualityEnhancementSelectionContext, "promptText">;
}) {
  const promptText = input.promptText.trim();
  if (!promptText || hasExistingQualityLine(promptText)) {
    return promptText;
  }

  const keywords = selectQualityEnhancementKeywords({
    ...input.context,
    promptText,
  });
  const line = buildQualityEnhancementLine(keywords, input.context.language);
  if (!line) {
    return promptText;
  }

  return `${promptText}\n${line}`;
}
