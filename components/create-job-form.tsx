"use client";

import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  ASPECT_RATIOS,
  COUNTRIES,
  getDefaultCountryForLanguage,
  getDefaultLanguageForCountry,
  IMAGE_TYPE_OPTIONS,
  OUTPUT_LANGUAGES,
  PLATFORMS,
  PRODUCT_CATEGORIES,
  RESOLUTIONS,
} from "@/lib/constants";
import { formatImageCounter } from "@/lib/create-form-copy";
import {
  getMaxReferenceImagesForSelection,
  getMaxSourceImagesForSelection,
  getPlannedRequestCount,
  getRequestImageCount,
  getRequestInputGroupCount,
} from "@/lib/generation-semantics";
import { getMaxImagesPerPromptForModel } from "@/lib/image-model-limits";
import { getRecommendedCreateDefaults } from "@/lib/recommendations";
import type { BrandRecord, GenerationSemantics, UiLanguage } from "@/lib/types";
import { dimensionsForVariant } from "@/lib/utils";

type SubmitBlockReason =
  | "files"
  | "prompt"
  | "reference"
  | "image-limit"
  | "variants"
  | "product-name"
  | "suite-selling-points"
  | "suite-material"
  | "suite-size";

const CREATE_JOB_DRAFT_KEY = "commerce-image-studio.create-draft.v1";
const INITIAL_SELECTED_TYPES = ["scene", "detail", "pain-point"];
const SUITE_SELECTED_TYPES = ["main-image", "lifestyle", "feature-overview", "scene", "material-craft", "size-spec"];
const AMAZON_A_PLUS_SELECTED_TYPES = ["poster", "feature-overview", "multi-scene", "detail", "size-spec", "culture-value"];
const INITIAL_SELECTED_RATIOS = ["1:1"];
const INITIAL_SELECTED_RESOLUTIONS = ["4K"];
const UI_SIZE_UNIT = 8;
const UI_HALF_STEP = UI_SIZE_UNIT / 2;
const VIEWPORT_TOP_RESERVE = UI_HALF_STEP * 4;
const VIEWPORT_MIN_WORKSPACE_HEIGHT = UI_HALF_STEP * 130;
const VIEWPORT_COMPACT_HEIGHT = UI_HALF_STEP * 245;
const VIEWPORT_COMPACT_WIDTH = UI_HALF_STEP * 390;
const VIEWPORT_CRAMPED_HEIGHT = UI_HALF_STEP * 215;
const VIEWPORT_CRAMPED_WIDTH = UI_HALF_STEP * 330;
const RATIO_DIRECTION_LABELS: Record<string, { zh: string; en: string }> = {
  "1:1": { zh: "方形", en: "Square" },
  "1:4": { zh: "长竖", en: "Tall portrait" },
  "1:8": { zh: "超竖", en: "Ultra portrait" },
  "3:2": { zh: "横图", en: "Landscape" },
  "2:3": { zh: "竖图", en: "Portrait" },
  "3:4": { zh: "竖图", en: "Portrait" },
  "4:1": { zh: "超宽", en: "Ultra wide" },
  "4:3": { zh: "横图", en: "Landscape" },
  "4:5": { zh: "竖图", en: "Portrait" },
  "5:4": { zh: "横图", en: "Landscape" },
  "8:1": { zh: "横幅", en: "Banner wide" },
  "9:16": { zh: "长竖", en: "Vertical" },
  "16:9": { zh: "宽屏", en: "Widescreen" },
  "21:9": { zh: "电影感", en: "Cinematic" },
  "9:21": { zh: "电影竖版", en: "Vertical cinematic" },
};
const INITIAL_PAYLOAD = {
  creationMode: "standard" as "standard" | "reference-remix" | "prompt" | "suite" | "amazon-a-plus",
  generationSemantics: "joint" as GenerationSemantics,
  referenceRemakeGoal: "hard-remake" as "hard-remake" | "soft-remake" | "structure-remake" | "semantic-remake",
  referenceStrength: "balanced" as "reference" | "balanced" | "product",
  referenceCompositionLock: "balanced" as "strict" | "balanced" | "flexible",
  referenceTextRegionPolicy: "preserve" as "preserve" | "leave-space" | "remove",
  referenceBackgroundMode: "preserve" as "preserve" | "simplify" | "regenerate",
  preserveReferenceText: true,
  referenceCopyMode: "reference" as "reference" | "copy-sheet",
  productName: "",
  sku: "",
  brandName: "",
  category: "general",
  sellingPoints: "",
  restrictions: "",
  sourceDescription: "",
  materialInfo: "",
  sizeInfo: "",
  customPrompt: "",
  customNegativePrompt: "",
  translatePromptToOutputLanguage: false,
  autoOptimizePrompt: false,
  country: "US",
  language: "en-US",
  platform: "amazon",
  variantsPerType: 1,
  includeCopyLayout: false,
  temporaryApiKey: "",
  temporaryApiBaseUrl: "",
  temporaryApiVersion: "",
  temporaryApiHeaders: "",
  referenceExtraPrompt: "",
  referenceNegativePrompt: "",
  referenceLayoutOverrideJson: "",
  referencePosterCopyOverrideJson: "",
};

function copyFor(language: UiLanguage): Record<string, string> {
  if (language === "zh") {
    return {
      autoOptimizePrompt: "优化为真实照片",
      brandLibraryHint: "可直接输入品牌名，也可从品牌库中选择。",
      brandName: "品牌名",
      category: "品类",
      clearDraft: "清空已填信息",
      continueCreate: "继续创建",
      customNegativePrompt: "负向提示词",
      customPrompt: "自定义提示词",
      chooseFiles: "选择文件",
      dropToReplace: "支持拖入替换",
      dropToUpload: "或将图片拖入此处上传",
      filesRequired: "请至少上传一张图片。",
      generationSemanticsBatch: "批量套模板",
      generationSemanticsJoint: "多图联合",
      generationSemanticsLabel: "生成方式",
      generateError: "提交失败，请检查表单与 API 配置后重试。",
      hint: "可在原图区切换多图联合或批量套模板。",
      imageCounter: "{current}/{total}",
      imageTypes: "图片类型",
      leavePrompt: "当前有未提交草稿。离开页面后，本次上传图片需要重新选择，确认离开吗？",
      livePreview: "实时预览",
      livePreviewEmpty: "上传图片后，这里会显示实时预览。",
      nextImage: "下一张",
      previousImage: "上一张",
      productName: "图片名",
      promptMode: "提示词模式",
      promptModePanelHint: "提示词模式支持纯提示词出图，也支持上传多张原图参与联合生成。",
      promptRequired: "提示词模式下，请填写自定义提示词。",
      quantityPending: "待填写",
      quantityRangeError: "生成数量必须是 1 到 10 的整数。",
      quantityRequired: "请填写生成数量。",
      ratios: "比例",
      recommendationApplied: "已应用推荐参数",
      referenceCopyMode: "文案来源",
      referenceCopyModeCopySheet: "按文案表格",
      referenceCopyModeCopySheetHint: "保持参考图排版，按下方文案字段重写需要替换的文字。",
      referenceCopyModeReference: "沿用参考图",
      referenceCopyModeReferenceHint: "默认尽量保留参考图原文字，只做最小必要替换。",
      referenceRemakeGoal: "复刻目标",
      referenceRemakeGoalHard: "硬复刻",
      referenceRemakeGoalSoft: "软复刻",
      referenceRemakeGoalStructure: "结构复刻",
      referenceRemakeGoalSemantic: "语义复刻",
      referenceStrength: "复刻强度",
      referenceStrengthReference: "参考优先",
      referenceStrengthBalanced: "平衡",
      referenceStrengthProduct: "产品优先",
      referenceCompositionLock: "构图锁定",
      referenceCompositionLockStrict: "严格锁定",
      referenceCompositionLockBalanced: "基本锁定",
      referenceCompositionLockFlexible: "允许调整",
      preserveReferenceText: "文字保留",
      preserveReferenceTextKeep: "尽量保留原字",
      preserveReferenceTextRewrite: "允许重写",
      referenceTextRegionPolicy: "文案区域策略",
      referenceTextRegionPolicyPreserve: "保留文案区",
      referenceTextRegionPolicyLeaveSpace: "保留留白区",
      referenceTextRegionPolicyRemove: "移除文案结构",
      referenceBackgroundMode: "背景处理",
      referenceBackgroundModePreserve: "保留背景",
      referenceBackgroundModeSimplify: "简化背景",
      referenceBackgroundModeRegenerate: "重建背景",
      referenceExtraPrompt: "额外要求",
      referenceNegativePrompt: "负向限制",
      referenceFilesRequired: "参考图复刻模式下，请至少上传一张参考图。",
      referenceImages: "参考图",
      referenceMode: "参考图复刻",
      referencePreviewEmpty: "上传参考图后，这里会显示参考图预览。",
      remakeSimplifiedHint: "复刻模式保留比例、分辨率和复刻控制项；联合生成时原图与参考图共享单次请求上限。",
      remakeVariants: "图片数量",
      referenceVariants: "复刻变体数",
      requestCountBreakdown: "计算方式：原图 {sources} × 类型 {types} × 比例 {ratios} × 分辨率 {resolutions} × 数量 {variants}。",
      requestCountPendingBreakdown: "数量字段必填，且必须是 1 到 10 的整数后，系统才会计算请求总数。",
      requestCountPendingSummary: "请先填写有效的生成数量（1-10）。",
      requestCountSummary: "本次将发起 {count} 次图像请求。",
      resolutions: "分辨率",
      restrictions: "限制词 / 禁用内容",
      sellingPoints: "卖点",
      sourceDescription: "补充说明",
      sourceImages: "图片原图",
      standardMode: "标准出图",
      submit: "提交任务",
      submitSuccessTitle: "任务创建成功",
      submitting: "提交中...",
      translatePromptToOutputLanguage: "翻译为输出语言",
      typesUnit: "类型",
      variants: "套图数量",
      viewResults: "查看结果",
    };
  }

  return {
    autoOptimizePrompt: "Optimize for realistic photos",
    brandLibraryHint: "Type a brand name or select one from the brand library.",
    brandName: "Brand name",
    category: "Category",
    clearDraft: "Clear filled data",
    continueCreate: "Continue",
    customNegativePrompt: "Negative prompt",
    customPrompt: "Custom prompt",
    chooseFiles: "Choose files",
    dropToReplace: "Drag images here to replace",
    dropToUpload: "Or drag images here to upload",
    filesRequired: "Upload at least one image.",
    generationSemanticsBatch: "Batch template",
    generationSemanticsJoint: "Joint input",
    generationSemanticsLabel: "Generation mode",
    generateError: "Submission failed. Check the form and API configuration, then try again.",
    hint: "Switch between joint multi-image generation and batch template runs from the source panel.",
    imageCounter: "{current}/{total}",
    imageTypes: "Image types",
    leavePrompt: "There is an unfinished draft. Leaving this page means uploaded images must be selected again. Leave anyway?",
    livePreview: "Live preview",
    livePreviewEmpty: "Upload images to show the live preview here.",
    nextImage: "Next",
    previousImage: "Previous",
    productName: "Image name",
    promptMode: "Prompt mode",
    promptModePanelHint: "Prompt mode supports prompt-only generation and joint multi-image generation with uploaded source images.",
    promptRequired: "Custom prompt is required in prompt mode.",
    quantityPending: "Pending",
    quantityRangeError: "Quantity must be an integer from 1 to 10.",
    quantityRequired: "Enter a quantity first.",
    ratios: "Ratios",
    recommendationApplied: "Recommended setup applied",
    referenceCopyMode: "Copy source",
    referenceCopyModeCopySheet: "Use copy sheet",
    referenceCopyModeCopySheetHint: "Keep the reference layout and rewrite changed text from the fields below.",
    referenceCopyModeReference: "Follow reference",
    referenceCopyModeReferenceHint: "Keep the reference wording whenever possible and only make minimal replacements.",
    referenceRemakeGoal: "Remake goal",
    referenceRemakeGoalHard: "Hard remake",
    referenceRemakeGoalSoft: "Soft remake",
    referenceRemakeGoalStructure: "Structure remake",
    referenceRemakeGoalSemantic: "Semantic remake",
    referenceStrength: "Remake strength",
    referenceStrengthReference: "Reference first",
    referenceStrengthBalanced: "Balanced",
    referenceStrengthProduct: "Product first",
    referenceCompositionLock: "Composition lock",
    referenceCompositionLockStrict: "Strict lock",
    referenceCompositionLockBalanced: "Basic lock",
    referenceCompositionLockFlexible: "Allow adjustments",
    preserveReferenceText: "Text preservation",
    preserveReferenceTextKeep: "Keep original text",
    preserveReferenceTextRewrite: "Allow rewrite",
    referenceTextRegionPolicy: "Text region policy",
    referenceTextRegionPolicyPreserve: "Preserve text zone",
    referenceTextRegionPolicyLeaveSpace: "Keep whitespace",
    referenceTextRegionPolicyRemove: "Remove text structure",
    referenceBackgroundMode: "Background mode",
    referenceBackgroundModePreserve: "Preserve",
    referenceBackgroundModeSimplify: "Simplify",
    referenceBackgroundModeRegenerate: "Regenerate",
    referenceExtraPrompt: "Extra instructions",
    referenceNegativePrompt: "Negative constraints",
    referenceFilesRequired: "Upload at least one reference image in remake mode.",
    referenceImages: "Reference images",
    referenceMode: "Reference remake",
    referencePreviewEmpty: "Upload a reference image to preview it here.",
    remakeSimplifiedHint: "Remake mode keeps ratio, resolution, and remake controls. In joint mode, source and reference images share the per-request cap.",
    remakeVariants: "Image quantity",
    referenceVariants: "Remake variants",
    requestCountBreakdown: "Formula: sources {sources} × types {types} × ratios {ratios} × resolutions {resolutions} × quantity {variants}.",
    requestCountPendingBreakdown: "The quantity field is required and must be an integer from 1 to 10 before the request total can be calculated.",
    requestCountPendingSummary: "Enter a valid quantity first (1-10).",
    requestCountSummary: "This task will send {count} image requests.",
    resolutions: "Resolutions",
    restrictions: "Restrictions / banned content",
    sellingPoints: "Selling points",
    sourceDescription: "Additional notes",
    sourceImages: "Source images",
    standardMode: "Standard",
    submit: "Submit task",
    submitSuccessTitle: "Task created successfully",
    submitting: "Submitting...",
    translatePromptToOutputLanguage: "Translate to output language",
    typesUnit: "types",
    variants: "Set quantity",
    viewResults: "View results",
  };
}
function parseVariantsPerTypeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : null;
}

function labelFor(value: string, language: UiLanguage, options: Array<{ value: string; label: Record<UiLanguage, string> }>) {
  if (value === "*") {
    return copyFor(language).wildcard;
  }
  return options.find((option) => option.value === value)?.label[language] ?? value;
}

function getDefaultMarketState(uiLanguage: UiLanguage) {
  return uiLanguage === "zh"
    ? { country: "CN", language: "zh-CN", platform: "tmall" }
    : { country: "US", language: "en-US", platform: "amazon" };
}

export function CreateJobForm({ defaultImageModel, language }: { defaultImageModel: string; language: UiLanguage }) {
  const router = useRouter();
  const text = useMemo(() => copyFor(language), [language]);
  const maxImagesPerPrompt = useMemo(() => getMaxImagesPerPromptForModel(defaultImageModel), [defaultImageModel]);
  const suiteModeLabel = language === "zh" ? "套图模式" : "Image set mode";
  const suiteModeHint =
    language === "zh"
      ? "上传一张原图后，系统会固定生成一套通用套图：主图、生活方式、卖点总览、场景图、材质工艺、尺寸参数。"
      : "Upload one source image and the system will generate a fixed image-set: main image, lifestyle, feature overview, scene, material & craft, and size spec.";
  const suiteModulesSummary =
    language === "zh"
      ? "固定包含：主图、生活方式、卖点总览、场景图、材质工艺、尺寸参数。"
      : "Fixed coverage: main image, lifestyle, feature overview, scene, material & craft, and size spec.";
  const suiteMaterialLabel = language === "zh" ? "材质工艺（必填）" : "Material (required)";
  const suiteSizeLabel = language === "zh" ? "尺寸参数（必填）" : "Size / dimensions (required)";
  const suiteSellingPointsLabel = language === "zh" ? "卖点（必填）" : "Selling points (required)";
  const suiteQuantityLabel = language === "zh" ? "套图数量" : "Set count";
  const suiteModeRequiredHint =
    language === "zh" ? "套图模式需要填写品类、卖点、材质工艺和尺寸参数。" : "Image set mode requires category, selling points, material, and size.";
  const amazonAPlusModeLabel = language === "zh" ? "亚马逊A+图模式" : "Amazon A+";
  const amazonAPlusModeHint =
    language === "zh"
      ? "上传一张原图后，系统会固定生成 Amazon A+ 模块组：海报图、卖点总览、多场景应用、细节图、尺寸参数、文化价值。"
      : "Upload one source image and the system will generate a fixed Amazon A+ module set: poster, feature overview, multi-scene, detail, size spec, and culture value.";
  const amazonAPlusLockedPlatformHint =
    language === "zh" ? "A+ 图模式固定使用 Amazon 平台。" : "A+ mode is locked to Amazon.";
  const amazonAPlusContextHint =
    language === "zh"
      ? "可选填写商品名、品牌、卖点和补充说明，让 A+ 模块组内容更完整。"
      : "Optionally add product name, brand, selling points, and notes for more complete A+ modules.";
  const amazonAPlusModulesSummary =
    language === "zh"
      ? "固定包含：海报图、卖点总览、多场景应用、细节图、尺寸参数、文化价值。"
      : "Fixed coverage: poster, feature overview, multi-scene, detail, size spec, and culture value.";
  const amazonAPlusProductLabel = language === "zh" ? "商品名（可选）" : "Product name (optional)";
  const amazonAPlusSellingPointsLabel = language === "zh" ? "卖点（可选）" : "Selling points (optional)";
  const amazonAPlusSourceDescriptionLabel = language === "zh" ? "补充说明（可选）" : "Additional notes (optional)";
  const [isPending, startTransition] = useTransition();
  const [files, setFiles] = useState<File[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [referencePreviewUrls, setReferencePreviewUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [referencePreviewIndex, setReferencePreviewIndex] = useState(0);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(INITIAL_SELECTED_TYPES);
  const [selectedRatios, setSelectedRatios] = useState<string[]>(INITIAL_SELECTED_RATIOS);
  const [selectedResolutions, setSelectedResolutions] = useState<string[]>(INITIAL_SELECTED_RESOLUTIONS);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [recommendationMessage, setRecommendationMessage] = useState("");
  const [autoLanguageByCountry, setAutoLanguageByCountry] = useState(true);
  const [promptMarketOverridesEnabled, setPromptMarketOverridesEnabled] = useState(false);
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [payload, setPayload] = useState(INITIAL_PAYLOAD);
  const [variantsInput, setVariantsInput] = useState(String(INITIAL_PAYLOAD.variantsPerType));
  const [draftReady, setDraftReady] = useState(false);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [submitBlockedFeedback, setSubmitBlockedFeedback] = useState(false);
  const [isSourceDropActive, setIsSourceDropActive] = useState(false);
  const [isReferenceDropActive, setIsReferenceDropActive] = useState(false);
  const allowLeaveRef = useRef(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceDropDepthRef = useRef(0);
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceDropDepthRef = useRef(0);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const customPromptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const suiteSellingPointsInputRef = useRef<HTMLTextAreaElement | null>(null);
  const suiteMaterialInfoInputRef = useRef<HTMLTextAreaElement | null>(null);
  const suiteSizeInfoInputRef = useRef<HTMLTextAreaElement | null>(null);
  const variantsInputRef = useRef<HTMLInputElement | null>(null);
  const submitBlockedTimerRef = useRef<number | null>(null);
  const [viewportLayout, setViewportLayout] = useState({
    compact: false,
    cramped: false,
    availableHeight: 0,
  });
  const currentGenerationSemantics = payload.generationSemantics;
  const currentReferenceImageCount = payload.creationMode === "reference-remix" ? referenceFiles.length : 0;
  const maxSourceImagesForSelection = useMemo(
    () =>
      getMaxSourceImagesForSelection(defaultImageModel, {
        generationSemantics: currentGenerationSemantics,
        referenceImageCount: currentReferenceImageCount,
      }),
    [currentGenerationSemantics, currentReferenceImageCount, defaultImageModel],
  );
  const maxReferenceImagesForSelection = useMemo(
    () =>
      payload.creationMode === "reference-remix"
        ? getMaxReferenceImagesForSelection(defaultImageModel, {
            generationSemantics: currentGenerationSemantics,
            sourceImageCount: files.length,
          })
        : 0,
    [currentGenerationSemantics, defaultImageModel, files.length, payload.creationMode],
  );
  const currentRequestImageCount = useMemo(
    () =>
      getRequestImageCount({
        creationMode: payload.creationMode,
        generationSemantics: currentGenerationSemantics,
        sourceImageCount: files.length,
        referenceImageCount: currentReferenceImageCount,
      }),
    [currentGenerationSemantics, currentReferenceImageCount, files.length, payload.creationMode],
  );

  function buildSourceLimitMessage(limit: number) {
    if (language === "zh") {
      if (limit <= 0) {
        return "当前联合生成没有剩余原图名额，请先减少参考图。";
      }

      return `当前生成方式最多可使用 ${limit} 张原图。`;
    }

    if (limit <= 0) {
      return "No source-image slots are left for joint generation. Reduce reference images first.";
    }

    return `The current generation mode supports up to ${limit} source images.`;
  }

  function buildReferenceLimitMessage(limit: number) {
    if (language === "zh") {
      if (currentGenerationSemantics === "joint") {
        return limit <= 0 ? "当前没有剩余参考图名额，请先减少原图。" : `当前最多还能添加 ${limit} 张参考图。`;
      }

      return `参考图复刻每次最多可使用 ${limit} 张参考图。`;
    }

    if (currentGenerationSemantics === "joint") {
      return limit <= 0
        ? "No reference-image slots are left. Reduce source images first."
        : `You can add up to ${limit} more reference images.`;
    }

    return `Reference remake supports up to ${limit} reference images per request.`;
  }

  function buildImageLimitMessage() {
    if (language === "zh") {
      return `当前选择会在单次请求中发送 ${currentRequestImageCount} 张图，已超过模型上限 ${maxImagesPerPrompt}。`;
    }

    return `The current selection would send ${currentRequestImageCount} images in one request, exceeding the ${maxImagesPerPrompt}-image model limit.`;
  }

  const parsedVariantsPerType = useMemo(() => parseVariantsPerTypeInput(variantsInput), [variantsInput]);
  const variantsValidationMessage = useMemo(() => {
    if (!variantsInput.trim()) {
      return text.quantityRequired;
    }

    return parsedVariantsPerType === null ? text.quantityRangeError : "";
  }, [parsedVariantsPerType, text.quantityRangeError, text.quantityRequired, variantsInput]);

  const hasDraftChanges = useMemo(() => {
    const payloadChanged = JSON.stringify(payload) !== JSON.stringify(INITIAL_PAYLOAD);
    const typesChanged = JSON.stringify(selectedTypes) !== JSON.stringify(INITIAL_SELECTED_TYPES);
    const ratiosChanged = JSON.stringify(selectedRatios) !== JSON.stringify(INITIAL_SELECTED_RATIOS);
    const resolutionsChanged = JSON.stringify(selectedResolutions) !== JSON.stringify(INITIAL_SELECTED_RESOLUTIONS);
    const hasImages = files.length > 0 || referenceFiles.length > 0;
    const promptMarketChanged = promptMarketOverridesEnabled;

    return payloadChanged || typesChanged || ratiosChanged || resolutionsChanged || hasImages || promptMarketChanged;
  }, [files.length, payload, promptMarketOverridesEnabled, referenceFiles.length, selectedRatios, selectedResolutions, selectedTypes]);
  const shouldWarnBeforeLeave = hasDraftChanges && !submittedJobId;
  const submitBlockReason = useMemo<SubmitBlockReason | null>(() => {
    if (isPending) {
      return null;
    }

    if (payload.creationMode !== "prompt" && !files.length) {
      return "files";
    }

    if (payload.creationMode === "prompt" && !payload.customPrompt.trim()) {
      return "prompt";
    }

    if (payload.creationMode === "reference-remix" && !referenceFiles.length) {
      return "reference";
    }

    if (currentRequestImageCount > maxImagesPerPrompt) {
      return "image-limit";
    }

    if (parsedVariantsPerType === null) {
      return "variants";
    }

    if (payload.creationMode === "standard" && !payload.productName.trim()) {
      return "product-name";
    }

    if (payload.creationMode === "suite" && !payload.sellingPoints.trim()) {
      return "suite-selling-points";
    }

    if (payload.creationMode === "suite" && !payload.materialInfo.trim()) {
      return "suite-material";
    }

    if (payload.creationMode === "suite" && !payload.sizeInfo.trim()) {
      return "suite-size";
    }

    return null;
  }, [
    files.length,
    isPending,
    currentRequestImageCount,
    maxImagesPerPrompt,
    payload.creationMode,
    payload.customPrompt,
    payload.materialInfo,
    payload.productName,
    payload.sellingPoints,
    payload.sizeInfo,
    parsedVariantsPerType,
    referenceFiles.length,
  ]);
  const submitBlockedMessage =
    submitBlockReason === "files"
      ? text.filesRequired
      : submitBlockReason === "prompt"
        ? text.promptRequired
        : submitBlockReason === "reference"
          ? text.referenceFilesRequired
          : submitBlockReason === "image-limit"
            ? buildImageLimitMessage()
          : submitBlockReason === "variants"
            ? variantsValidationMessage
          : submitBlockReason === "suite-selling-points" ||
              submitBlockReason === "suite-material" ||
              submitBlockReason === "suite-size"
            ? suiteModeRequiredHint
              : submitBlockReason === "product-name"
                ? language === "zh"
                  ? "请先填写图片名。"
                  : "Please fill in the image name first."
                : "";
  const isSubmitBlocked = Boolean(submitBlockReason);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(CREATE_JOB_DRAFT_KEY);
      if (!rawDraft) {
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(rawDraft) as {
        payload?: typeof INITIAL_PAYLOAD;
        selectedTypes?: string[];
        selectedRatios?: string[];
        selectedResolutions?: string[];
        autoLanguageByCountry?: boolean;
        promptMarketOverridesEnabled?: boolean;
        recommendationMessage?: string;
      };

      if (draft.payload) {
        setPayload((current) => ({ ...current, ...draft.payload }));
        setVariantsInput(String(draft.payload.variantsPerType ?? INITIAL_PAYLOAD.variantsPerType));
      }
      if (draft.selectedTypes?.length) {
        setSelectedTypes(draft.selectedTypes);
      }
      if (draft.selectedRatios?.length) {
        setSelectedRatios([draft.selectedRatios[0]]);
      }
      if (draft.selectedResolutions?.length) {
        setSelectedResolutions([draft.selectedResolutions[0]]);
      }
      if (typeof draft.autoLanguageByCountry === "boolean") {
        setAutoLanguageByCountry(draft.autoLanguageByCountry);
      }
      if (typeof draft.promptMarketOverridesEnabled === "boolean") {
        setPromptMarketOverridesEnabled(draft.promptMarketOverridesEnabled);
      }
      if (draft.recommendationMessage) {
        setRecommendationMessage(draft.recommendationMessage);
      }

    } catch {
      window.localStorage.removeItem(CREATE_JOB_DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
  }, []);

  useEffect(
    () => () => {
      if (submitBlockedTimerRef.current) {
        window.clearTimeout(submitBlockedTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setVariantsInput(String(payload.variantsPerType));
  }, [payload.variantsPerType]);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    window.localStorage.setItem(
      CREATE_JOB_DRAFT_KEY,
      JSON.stringify({
        payload,
        selectedTypes,
        selectedRatios,
        selectedResolutions,
        autoLanguageByCountry,
        promptMarketOverridesEnabled,
        recommendationMessage,
      }),
    );
  }, [
    autoLanguageByCountry,
    promptMarketOverridesEnabled,
    draftReady,
    payload,
    recommendationMessage,
    selectedRatios,
    selectedResolutions,
    selectedTypes,
  ]);

  useEffect(() => {
    if (!draftReady || !shouldWarnBeforeLeave) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowLeaveRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = text.leavePrompt;
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (allowLeaveRef.current) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.href === currentUrl.href) {
        return;
      }

      const confirmed = window.confirm(text.leavePrompt);
      if (!confirmed) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        return;
      }

      allowLeaveRef.current = true;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [draftReady, shouldWarnBeforeLeave, text.leavePrompt]);

  useEffect(() => {
    let cancelled = false;

    async function loadBrands() {
      const response = await fetch("/api/brands");
      if (!response.ok) {
        return;
      }
      const body = (await response.json()) as { brands?: BrandRecord[] };
      if (!cancelled) {
        setBrands(body.brands ?? []);
      }
    }

    loadBrands();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!files.length) {
      setPreviewUrls([]);
      setPreviewIndex(0);
      return;
    }

    const objectUrls = files.map((file) => URL.createObjectURL(file));
    setPreviewUrls(objectUrls);
    setPreviewIndex((current) => Math.min(current, objectUrls.length - 1));

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  useEffect(() => {
    if (!referenceFiles.length) {
      setReferencePreviewUrls([]);
      setReferencePreviewIndex(0);
      return;
    }

    const objectUrls = referenceFiles.map((file) => URL.createObjectURL(file));
    setReferencePreviewUrls(objectUrls);
    setReferencePreviewIndex((current) => Math.min(current, objectUrls.length - 1));

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [referenceFiles]);

  useEffect(() => {
    if (previewUrls.length <= 1) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isEditable = target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";

      if (isEditable) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPreviewIndex((current) => (current === 0 ? previewUrls.length - 1 : current - 1));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setPreviewIndex((current) => (current === previewUrls.length - 1 ? 0 : current + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [previewUrls.length]);

  useEffect(() => {
    if (payload.creationMode !== "reference-remix") {
      return;
    }

    if (selectedTypes.length !== 1 || selectedTypes[0] !== "scene") {
      setSelectedTypes(["scene"]);
    }

    if (selectedRatios.length !== 1) {
      setSelectedRatios([selectedRatios[0] ?? "1:1"]);
    }

    if (selectedResolutions.length !== 1) {
      setSelectedResolutions([selectedResolutions[0] ?? "4K"]);
    }
    if (payload.variantsPerType < 1 || payload.variantsPerType > 4) {
      setVariantsInput("1");
    }

    setPayload((current) => {
      const next = { ...current };
      let changed = false;

      if (current.includeCopyLayout) {
        next.includeCopyLayout = false;
        changed = true;
      }
      if (current.country) {
        next.country = "";
        changed = true;
      }
      if (current.language) {
        next.language = "";
        changed = true;
      }
      if (current.platform) {
        next.platform = "";
        changed = true;
      }
      if (
        current.referenceRemakeGoal !== "hard-remake" &&
        current.referenceRemakeGoal !== "soft-remake" &&
        current.referenceRemakeGoal !== "structure-remake" &&
        current.referenceRemakeGoal !== "semantic-remake"
      ) {
        next.referenceRemakeGoal = "hard-remake";
        changed = true;
      }
      if (
        current.referenceStrength !== "reference" &&
        current.referenceStrength !== "balanced" &&
        current.referenceStrength !== "product"
      ) {
        next.referenceStrength = "balanced";
        changed = true;
      }
      if (
        current.referenceCompositionLock !== "strict" &&
        current.referenceCompositionLock !== "balanced" &&
        current.referenceCompositionLock !== "flexible"
      ) {
        next.referenceCompositionLock = "balanced";
        changed = true;
      }
      if (typeof current.preserveReferenceText !== "boolean") {
        next.preserveReferenceText = true;
        changed = true;
      }
      if (current.referenceCopyMode !== "reference" && current.referenceCopyMode !== "copy-sheet") {
        next.referenceCopyMode = "reference";
        changed = true;
      }
      if (
        current.referenceTextRegionPolicy !== "preserve" &&
        current.referenceTextRegionPolicy !== "leave-space" &&
        current.referenceTextRegionPolicy !== "remove"
      ) {
        next.referenceTextRegionPolicy = "preserve";
        changed = true;
      }
      if (
        current.referenceBackgroundMode !== "preserve" &&
        current.referenceBackgroundMode !== "simplify" &&
        current.referenceBackgroundMode !== "regenerate"
      ) {
        next.referenceBackgroundMode = "preserve";
        changed = true;
      }
      if (current.variantsPerType < 1 || current.variantsPerType > 4) {
        next.variantsPerType = 1;
        changed = true;
      }
      if (current.referenceLayoutOverrideJson) {
        next.referenceLayoutOverrideJson = "";
        changed = true;
      }
      if (current.referencePosterCopyOverrideJson) {
        next.referencePosterCopyOverrideJson = "";
        changed = true;
      }

      return changed ? next : current;
    });
  }, [language, payload.creationMode, selectedRatios, selectedResolutions, selectedTypes]);

  useEffect(() => {
    if (payload.creationMode === "prompt" || payload.creationMode === "reference-remix") {
      return;
    }

    const defaults = getDefaultMarketState(language);
    const defaultCountry = payload.country || defaults.country;
    const defaultLanguage = payload.language || getDefaultLanguageForCountry(defaultCountry) || defaults.language;
    const defaultPlatform = payload.creationMode === "amazon-a-plus" ? "amazon" : payload.platform || defaults.platform;

    if (
      payload.country === defaultCountry &&
      payload.language === defaultLanguage &&
      payload.platform === defaultPlatform
    ) {
      return;
    }

    setPayload((current) => ({
      ...current,
      country: current.country || defaults.country,
      language: current.language || getDefaultLanguageForCountry(current.country || defaults.country) || defaults.language,
      platform: current.creationMode === "amazon-a-plus" ? "amazon" : current.platform || defaults.platform,
    }));
  }, [language, payload.country, payload.creationMode, payload.language, payload.platform]);

  useEffect(() => {
    if (payload.creationMode !== "prompt") {
      return;
    }

    const nextCountry = getDefaultCountryForLanguage(payload.language);
    if (nextCountry && payload.country !== nextCountry) {
      setPayload((current) => ({
        ...current,
        country: getDefaultCountryForLanguage(current.language) ?? current.country,
      }));
    }
  }, [payload.country, payload.creationMode, payload.language]);

  useEffect(() => {
    const updateViewportLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const topOffset = formRef.current?.getBoundingClientRect().top ?? 0;
      const availableHeight = Math.max(height - topOffset - VIEWPORT_TOP_RESERVE, VIEWPORT_MIN_WORKSPACE_HEIGHT);

      setViewportLayout({
        compact: height <= VIEWPORT_COMPACT_HEIGHT || width <= VIEWPORT_COMPACT_WIDTH,
        cramped: height <= VIEWPORT_CRAMPED_HEIGHT || width <= VIEWPORT_CRAMPED_WIDTH,
        availableHeight,
      });
    };

    updateViewportLayout();
    window.addEventListener("resize", updateViewportLayout);

    return () => {
      window.removeEventListener("resize", updateViewportLayout);
    };
  }, []);

  function toggleSelection(value: string, selected: string[], setter: (items: string[]) => void) {
    if (selected.includes(value)) {
      setter(selected.filter((item) => item !== value));
      return;
    }
    setter([...selected, value]);
  }

  function selectSingle(value: string, setter: (items: string[]) => void) {
    setter([value]);
  }

  function applySourceFiles(nextFiles: File[]) {
    const limitedFiles = Number.isFinite(maxSourceImagesForSelection) ? nextFiles.slice(0, maxSourceImagesForSelection) : nextFiles;
    if (limitedFiles.length < nextFiles.length) {
      setErrorMessage(buildSourceLimitMessage(Number.isFinite(maxSourceImagesForSelection) ? maxSourceImagesForSelection : nextFiles.length));
    } else {
      setErrorMessage("");
    }
    setFiles(limitedFiles);
    setPreviewIndex(0);
    setIsSourceDropActive(false);
    sourceDropDepthRef.current = 0;
  }

  function extractImageFiles(fileList: FileList | null) {
    return Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
  }

  function handleSourceFileChange(event: ChangeEvent<HTMLInputElement>) {
    applySourceFiles(extractImageFiles(event.target.files));
    event.target.value = "";
  }

  function openSourceFilePicker() {
    sourceFileInputRef.current?.click();
  }

  function handleSourceDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    sourceDropDepthRef.current += 1;
    setIsSourceDropActive(true);
  }

  function handleSourceDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isSourceDropActive) {
      setIsSourceDropActive(true);
    }
  }

  function handleSourceDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    sourceDropDepthRef.current = Math.max(0, sourceDropDepthRef.current - 1);
    if (sourceDropDepthRef.current === 0) {
      setIsSourceDropActive(false);
    }
  }

  function handleSourceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    sourceDropDepthRef.current = 0;
    const nextFiles = extractImageFiles(event.dataTransfer.files);
    if (!nextFiles.length) {
      setIsSourceDropActive(false);
      return;
    }
    applySourceFiles(nextFiles);
  }

  function applyReferenceFiles(nextFiles: File[]) {
    const limitedFiles = nextFiles.slice(0, maxReferenceImagesForSelection);
    if (nextFiles.length > maxReferenceImagesForSelection) {
      setErrorMessage(buildReferenceLimitMessage(maxReferenceImagesForSelection));
    } else {
      setErrorMessage("");
    }
    setReferenceFiles(limitedFiles);
    setReferencePreviewIndex(0);
    setIsReferenceDropActive(false);
    referenceDropDepthRef.current = 0;
  }

  function handleReferenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    applyReferenceFiles(extractImageFiles(event.target.files));
    event.target.value = "";
  }

  function openReferenceFilePicker() {
    referenceFileInputRef.current?.click();
  }

  function handleReferenceDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    referenceDropDepthRef.current += 1;
    setIsReferenceDropActive(true);
  }

  function handleReferenceDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (!isReferenceDropActive) {
      setIsReferenceDropActive(true);
    }
  }

  function handleReferenceDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    referenceDropDepthRef.current = Math.max(0, referenceDropDepthRef.current - 1);
    if (referenceDropDepthRef.current === 0) {
      setIsReferenceDropActive(false);
    }
  }

  function handleReferenceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    referenceDropDepthRef.current = 0;
    const nextFiles = extractImageFiles(event.dataTransfer.files);
    if (!nextFiles.length) {
      setIsReferenceDropActive(false);
      return;
    }
    applyReferenceFiles(nextFiles);
  }

  function showPreviousPreview() {
    setPreviewIndex((current) => (current === 0 ? previewUrls.length - 1 : current - 1));
  }

  function showNextPreview() {
    setPreviewIndex((current) => (current === previewUrls.length - 1 ? 0 : current + 1));
  }

  function showPreviousReferencePreview() {
    setReferencePreviewIndex((current) => (current === 0 ? referencePreviewUrls.length - 1 : current - 1));
  }

  function showNextReferencePreview() {
    setReferencePreviewIndex((current) => (current === referencePreviewUrls.length - 1 ? 0 : current + 1));
  }

  function applyRecommendedSetup() {
    if (payload.creationMode !== "standard") {
      return;
    }

    const recommendation = getRecommendedCreateDefaults({
      platform: payload.platform,
      category: payload.category,
    });

    setSelectedTypes(recommendation.selectedTypes);
    setSelectedRatios(recommendation.selectedRatios.length ? [recommendation.selectedRatios[0]] : ["1:1"]);
    setSelectedResolutions(recommendation.selectedResolutions.length ? [recommendation.selectedResolutions[0]] : ["1K"]);
    setPayload((current) => ({
      ...current,
      variantsPerType: recommendation.variantsPerType,
    }));
    setVariantsInput(String(recommendation.variantsPerType));
    setRecommendationMessage(`${text.recommendationApplied}: ${recommendation.reason[language]}`);
  }

  function prepareNextCreate() {
    setFiles([]);
    setReferenceFiles([]);
    setPreviewUrls([]);
    setReferencePreviewUrls([]);
    setPreviewIndex(0);
    setReferencePreviewIndex(0);
    setErrorMessage("");
    setPayload((current) => ({
      ...current,
      productName: "",
      sku: "",
      brandName: "",
      sellingPoints: "",
      restrictions: "",
      sourceDescription: "",
      materialInfo: "",
      sizeInfo: "",
      customPrompt: "",
      customNegativePrompt: "",
      referenceExtraPrompt: "",
      referenceNegativePrompt: "",
      referenceLayoutOverrideJson: "",
      referencePosterCopyOverrideJson: "",
    }));
  }

  function focusBlockedSubmitTarget(reason: SubmitBlockReason) {
    if (reason === "files") {
      sourceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      sourceFileInputRef.current?.focus();
      return;
    }

    if (reason === "reference") {
      referenceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      referenceFileInputRef.current?.focus();
      return;
    }

    if (reason === "variants") {
      window.setTimeout(() => {
        variantsInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        variantsInputRef.current?.focus();
        variantsInputRef.current?.select();
      }, 0);
      return;
    }

    window.setTimeout(() => {
      if (reason === "prompt") {
        customPromptInputRef.current?.focus();
        customPromptInputRef.current?.select();
        return;
      }

      if (reason === "suite-selling-points") {
        suiteSellingPointsInputRef.current?.focus();
        suiteSellingPointsInputRef.current?.select();
        return;
      }

      if (reason === "suite-material") {
        suiteMaterialInfoInputRef.current?.focus();
        suiteMaterialInfoInputRef.current?.select();
        return;
      }

      if (reason === "suite-size") {
        suiteSizeInfoInputRef.current?.focus();
        suiteSizeInfoInputRef.current?.select();
        return;
      }

      productNameInputRef.current?.focus();
      productNameInputRef.current?.select();
    }, 0);
  }

  function triggerSubmitBlockedFeedback(reason: SubmitBlockReason) {
    setErrorMessage(
      reason === "files"
        ? text.filesRequired
        : reason === "prompt"
          ? text.promptRequired
        : reason === "reference"
            ? text.referenceFilesRequired
            : reason === "image-limit"
              ? buildImageLimitMessage()
            : reason === "variants"
              ? variantsValidationMessage
            : reason === "product-name"
              ? language === "zh"
                ? "请先填写图片名。"
                : "Please fill in the image name first."
              : suiteModeRequiredHint,
    );
    setSubmitBlockedFeedback(false);
    window.clearTimeout(submitBlockedTimerRef.current ?? undefined);
    window.requestAnimationFrame(() => {
      setSubmitBlockedFeedback(true);
      submitBlockedTimerRef.current = window.setTimeout(() => {
        setSubmitBlockedFeedback(false);
      }, 460);
    });
    focusBlockedSubmitTarget(reason);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (submitBlockReason) {
      triggerSubmitBlockedFeedback(submitBlockReason);
      return;
    }

    if (parsedVariantsPerType === null) {
      triggerSubmitBlockedFeedback("variants");
      return;
    }

    let referenceLayoutOverride: unknown = null;
    let referencePosterCopyOverride: unknown = null;

    startTransition(async () => {
      try {
        const formData = new FormData();
        for (const file of files) {
          formData.append("files", file);
        }
        if (payload.creationMode === "reference-remix") {
          for (const file of referenceFiles) {
            formData.append("referenceFiles", file);
          }
        }
        formData.append(
          "payload",
          JSON.stringify({
            ...payload,
            sku: "",
            variantsPerType: parsedVariantsPerType,
            selectedTypes: effectiveSelectedTypes,
            selectedRatios,
            selectedResolutions,
            referenceRemakeGoal: payload.referenceRemakeGoal,
            referenceStrength: payload.referenceStrength,
            referenceCompositionLock: payload.referenceCompositionLock,
            referenceTextRegionPolicy: payload.referenceTextRegionPolicy,
            referenceBackgroundMode: payload.referenceBackgroundMode,
            preserveReferenceText: payload.preserveReferenceText,
            referenceCopyMode:
              payload.creationMode === "reference-remix"
                ? payload.referenceCopyMode === "copy-sheet"
                  ? "copy-sheet"
                  : "reference"
                : payload.referenceCopyMode,
            referenceExtraPrompt: payload.referenceExtraPrompt,
            referenceNegativePrompt: payload.referenceNegativePrompt,
            referenceLayoutOverride: payload.creationMode === "reference-remix" ? null : referenceLayoutOverride,
            referencePosterCopyOverride: payload.creationMode === "reference-remix" ? null : referencePosterCopyOverride,
            temporaryProvider: {
              apiKey: payload.temporaryApiKey,
              apiBaseUrl: payload.temporaryApiBaseUrl,
              apiVersion: payload.temporaryApiVersion,
              apiHeaders: payload.temporaryApiHeaders,
            },
            uiLanguage: language,
          }),
        );

        const response = await fetch("/api/generate", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const rawText = await response.text().catch(() => "");
          let parsedBody: { error?: string } | null = null;
          try {
            parsedBody = rawText ? (JSON.parse(rawText) as { error?: string }) : null;
          } catch {
            parsedBody = null;
          }
          setErrorMessage(parsedBody?.error || rawText || text.generateError);
          return;
        }

        const body = (await response.json()) as { jobId: string };
        window.localStorage.removeItem(CREATE_JOB_DRAFT_KEY);
        setSubmittedJobId(body.jobId);
      } catch (error) {
        setErrorMessage(error instanceof Error && error.message ? error.message : text.generateError);
      }
    });
  }

  function handleContinueCreate() {
    setSubmittedJobId(null);
    prepareNextCreate();
    window.setTimeout(() => {
      if (payload.creationMode === "prompt") {
        customPromptInputRef.current?.focus();
        customPromptInputRef.current?.select();
        return;
      }

      productNameInputRef.current?.focus();
      productNameInputRef.current?.select();
    }, 0);
  }

  function handleViewResults() {
    if (!submittedJobId) {
      return;
    }

    allowLeaveRef.current = true;
    router.push(`/jobs/${submittedJobId}`);
  }

  const currentPreviewUrl = previewUrls[previewIndex] ?? null;
  const currentReferencePreviewUrl = referencePreviewUrls[referencePreviewIndex] ?? null;
  const resolutionOptions = RESOLUTIONS;
  const effectiveSelectedTypes =
    payload.creationMode === "prompt" || payload.creationMode === "reference-remix"
      ? ["scene"]
      : payload.creationMode === "suite"
        ? SUITE_SELECTED_TYPES
        : payload.creationMode === "amazon-a-plus"
          ? AMAZON_A_PLUS_SELECTED_TYPES
          : selectedTypes;
  const referenceCopyModeLabel =
    payload.referenceCopyMode === "copy-sheet" ? text.referenceCopyModeCopySheet : text.referenceCopyModeReference;
  const generationSemanticsLabel =
    currentGenerationSemantics === "joint" ? text.generationSemanticsJoint : text.generationSemanticsBatch;
  const generationHint =
    payload.creationMode === "prompt"
      ? text.promptModePanelHint
      : payload.creationMode === "suite"
        ? suiteModulesSummary
      : payload.creationMode === "amazon-a-plus"
        ? amazonAPlusModulesSummary
      : payload.creationMode === "reference-remix"
        ? text.remakeSimplifiedHint
        : recommendationMessage || text.hint;
  const joinSummaryParts = (parts: Array<string | null | undefined>) =>
    parts
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" / ");
  const marketSummary =
    payload.creationMode === "reference-remix"
      ? joinSummaryParts([
          generationSemanticsLabel,
          referenceCopyModeLabel,
          selectedRatios[0],
          selectedResolutions[0],
          parsedVariantsPerType === null ? text.quantityPending : `${parsedVariantsPerType}`,
        ])
      : payload.creationMode === "prompt"
        ? joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.platform ? labelFor(payload.platform, language, PLATFORMS) : "",
          payload.language ? labelFor(payload.language, language, OUTPUT_LANGUAGES) : "",
          text.promptMode,
          generationSemanticsLabel,
          selectedRatios[0],
          selectedResolutions[0],
        ])
      : payload.creationMode === "suite"
        ? joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.language ? labelFor(payload.language, language, OUTPUT_LANGUAGES) : "",
          payload.platform ? labelFor(payload.platform, language, PLATFORMS) : "",
          suiteModeLabel,
          generationSemanticsLabel,
          effectiveSelectedTypes.length ? `${effectiveSelectedTypes.length} ${text.typesUnit}` : "",
          selectedRatios[0],
          selectedResolutions[0],
        ])
      : payload.creationMode === "amazon-a-plus"
        ? joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.language ? labelFor(payload.language, language, OUTPUT_LANGUAGES) : "",
          amazonAPlusModeLabel,
          generationSemanticsLabel,
          effectiveSelectedTypes.length ? `${effectiveSelectedTypes.length} ${text.typesUnit}` : "",
          selectedRatios[0],
          selectedResolutions[0],
          ])
      : joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.platform ? labelFor(payload.platform, language, PLATFORMS) : "",
          text.standardMode,
          generationSemanticsLabel,
          selectedTypes.length ? `${selectedTypes.length} ${text.typesUnit}` : "",
          selectedRatios[0],
          selectedResolutions[0],
        ]);
  const requestInputCount = getRequestInputGroupCount({
    creationMode: payload.creationMode,
    generationSemantics: currentGenerationSemantics,
    sourceImageCount: files.length,
  });
  const requestCount =
    parsedVariantsPerType === null
      ? null
      : getPlannedRequestCount({
          creationMode: payload.creationMode,
          generationSemantics: currentGenerationSemantics,
          sourceImageCount: files.length,
          typeCount: effectiveSelectedTypes.length,
          ratioCount: selectedRatios.length,
          resolutionCount: selectedResolutions.length,
          variantsPerType: parsedVariantsPerType,
        });
  const requestCountValue = requestCount === null ? "--" : String(requestCount);
  const selectedRatioDirection =
    RATIO_DIRECTION_LABELS[selectedRatios[0] ?? "1:1"]?.[language] ?? (language === "zh" ? "单选" : "Single select");
  const actualGenerationLabel = language === "zh" ? "实际生成数量" : "Actual outputs";
  const requestInputLabel =
    payload.creationMode === "prompt" && files.length === 0
      ? language === "zh"
        ? "纯提示词 1 组"
        : "1 prompt-only input"
      : currentGenerationSemantics === "joint"
      ? language === "zh"
        ? `${requestInputCount} 组联合输入`
        : `${requestInputCount} joint input group`
      : language === "zh"
        ? `${requestInputCount} 原图`
        : `${requestInputCount} source image`;
  const formulaDisplay =
    language === "zh"
      ? `${requestInputLabel} × ${effectiveSelectedTypes.length} 类型 × ${selectedRatios.length} 比例 × ${selectedResolutions.length} 分辨率 × ${parsedVariantsPerType ?? "-"} 数量`
      : `${requestInputLabel} × ${effectiveSelectedTypes.length} type × ${selectedRatios.length} ratio × ${selectedResolutions.length} resolution × ${parsedVariantsPerType ?? "-"} qty`;
  const currentPlatformLabel =
    payload.creationMode === "amazon-a-plus" ? "Amazon" : labelFor(payload.platform, language, PLATFORMS);
  const selectedResolutionLabel = labelFor(selectedResolutions[0] ?? "4K", language, RESOLUTIONS);
  const resolutionDetailMap = useMemo(
    () =>
      Object.fromEntries(
        resolutionOptions.map((option) => {
          const { width, height } = dimensionsForVariant(selectedRatios[0] ?? "1:1", option.value);
          return [option.value, `${width}×${height}`];
        }),
      ) as Record<string, string>,
    [resolutionOptions, selectedRatios],
  );
  const selectedResolutionDetail = resolutionDetailMap[selectedResolutions[0] ?? "4K"] ?? "";
  const referenceStrengthOptions = [
    { value: "reference" as const, label: text.referenceStrengthReference },
    { value: "balanced" as const, label: text.referenceStrengthBalanced },
    { value: "product" as const, label: text.referenceStrengthProduct },
  ];
  const referenceRemakeGoalOptions = [
    { value: "hard-remake" as const, label: text.referenceRemakeGoalHard },
    { value: "soft-remake" as const, label: text.referenceRemakeGoalSoft },
    { value: "structure-remake" as const, label: text.referenceRemakeGoalStructure },
    { value: "semantic-remake" as const, label: text.referenceRemakeGoalSemantic },
  ];
  const referenceCompositionLockOptions = [
    { value: "strict" as const, label: text.referenceCompositionLockStrict },
    { value: "balanced" as const, label: text.referenceCompositionLockBalanced },
    { value: "flexible" as const, label: text.referenceCompositionLockFlexible },
  ];
  const referenceBackgroundOptions = [
    { value: "preserve" as const, label: text.referenceBackgroundModePreserve },
    { value: "simplify" as const, label: text.referenceBackgroundModeSimplify },
    { value: "regenerate" as const, label: text.referenceBackgroundModeRegenerate },
  ];
  const referenceTextRegionPolicyOptions = [
    { value: "preserve" as const, label: text.referenceTextRegionPolicyPreserve },
    { value: "leave-space" as const, label: text.referenceTextRegionPolicyLeaveSpace },
    { value: "remove" as const, label: text.referenceTextRegionPolicyRemove },
  ];
  const referenceTextPreservationOptions = [
    { value: "keep" as const, label: text.preserveReferenceTextKeep, checked: payload.preserveReferenceText },
    { value: "rewrite" as const, label: text.preserveReferenceTextRewrite, checked: !payload.preserveReferenceText },
  ];
  const remixVariantOptions = [1, 2, 3, 4];
  const createWorkspaceClassName = [
    "create-workspace",
    viewportLayout.compact ? "is-compact-viewport" : "",
    viewportLayout.cramped ? "is-cramped-viewport" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const createWorkspaceStyle = viewportLayout.compact
    ? ({ "--create-workspace-height": `${viewportLayout.availableHeight}px` } as CSSProperties)
    : undefined;
  const promptRows = viewportLayout.cramped ? 3 : viewportLayout.compact ? 4 : 5;
  const longRows = viewportLayout.compact ? 2 : 3;
  const mediumRows = 2;
  const jsonRows = viewportLayout.cramped ? 5 : viewportLayout.compact ? 6 : 8;
  const posterJsonRows = viewportLayout.cramped ? 4 : viewportLayout.compact ? 5 : 6;
  const headerRows = viewportLayout.compact ? 3 : 4;
  function activateReferenceRemixMode() {
    setPromptMarketOverridesEnabled(false);
    setSelectedTypes(["scene"]);
    setSelectedRatios(["1:1"]);
    setSelectedResolutions(["4K"]);
    setVariantsInput("1");
    setPayload((current) => ({
      ...current,
      creationMode: "reference-remix",
      country: "",
      language: "",
      platform: "",
      includeCopyLayout: false,
      referenceRemakeGoal: "hard-remake",
      referenceStrength: "balanced",
      referenceCompositionLock: "balanced",
      referenceCopyMode: "reference",
      preserveReferenceText: true,
      referenceTextRegionPolicy: "preserve",
      referenceBackgroundMode: "preserve",
      referenceExtraPrompt: "",
      referenceNegativePrompt: "",
      referenceLayoutOverrideJson: "",
      referencePosterCopyOverrideJson: "",
      variantsPerType: 1,
    }));
  }
  const generationSemanticsSelector = (
    <div
      aria-label={text.generationSemanticsLabel}
      className="create-generation-semantics-toggle"
      role="radiogroup"
    >
      <label className={currentGenerationSemantics === "joint" ? "create-generation-semantics-option is-active" : "create-generation-semantics-option"}>
        <input
          checked={currentGenerationSemantics === "joint"}
          name="generation-semantics"
          onChange={() => setPayload((current) => ({ ...current, generationSemantics: "joint" }))}
          type="radio"
        />
        <span>{text.generationSemanticsJoint}</span>
      </label>
      <label className={currentGenerationSemantics === "batch" ? "create-generation-semantics-option is-active" : "create-generation-semantics-option"}>
        <input
          checked={currentGenerationSemantics === "batch"}
          name="generation-semantics"
          onChange={() => setPayload((current) => ({ ...current, generationSemantics: "batch" }))}
          type="radio"
        />
        <span>{text.generationSemanticsBatch}</span>
      </label>
    </div>
  );
  const creationModeSelector = (
    <div
      aria-label={language === "zh" ? "模式选择" : "Mode selection"}
      className="create-header-mode-fieldset"
      role="radiogroup"
    >
      <div className="chip-grid small creation-mode-grid">
        <label className={payload.creationMode === "standard" ? "chip is-active" : "chip"}>
          <input
            checked={payload.creationMode === "standard"}
            name="creation-mode"
            onChange={() => setPayload((current) => ({ ...current, creationMode: "standard" }))}
            type="radio"
          />
          <span>{text.standardMode}</span>
        </label>
        <label className={payload.creationMode === "suite" ? "chip is-active" : "chip"}>
          <input
            checked={payload.creationMode === "suite"}
            name="creation-mode"
            onChange={() => setPayload((current) => ({ ...current, creationMode: "suite" }))}
            type="radio"
          />
          <span>{suiteModeLabel}</span>
        </label>
        <label className={payload.creationMode === "amazon-a-plus" ? "chip is-active" : "chip"}>
          <input
            checked={payload.creationMode === "amazon-a-plus"}
            name="creation-mode"
            onChange={() => setPayload((current) => ({ ...current, creationMode: "amazon-a-plus", platform: "amazon" }))}
            type="radio"
          />
          <span>{amazonAPlusModeLabel}</span>
        </label>
        <label className={payload.creationMode === "prompt" ? "chip is-active" : "chip"}>
          <input
            checked={payload.creationMode === "prompt"}
            name="creation-mode"
            onChange={() => {
              setPromptMarketOverridesEnabled(false);
              setPayload((current) => ({
                ...current,
                creationMode: "prompt",
                platform: INITIAL_PAYLOAD.platform,
              }));
            }}
            type="radio"
          />
          <span>{text.promptMode}</span>
        </label>
        <label className={payload.creationMode === "reference-remix" ? "chip is-active" : "chip"}>
          <input
            checked={payload.creationMode === "reference-remix"}
            name="creation-mode"
            onChange={activateReferenceRemixMode}
            type="radio"
          />
          <span>{text.referenceMode}</span>
        </label>
      </div>
    </div>
  );
  return (
    <>
      <form className={createWorkspaceClassName} onSubmit={handleSubmit} ref={formRef} style={createWorkspaceStyle}>
        <aside className="create-sidebar">
          <div className="create-sidebar-sticky">
            <section className="panel create-panel create-source-panel">
              <div className="split-header compact">
                <div>
                  <h2>{text.sourceImages}</h2>
                </div>
                <div className="create-panel-actions">
                  {generationSemanticsSelector}
                  <button className="preview-stage-upload-button" onClick={openSourceFilePicker} type="button">
                    {text.chooseFiles}
                  </button>
                  {files.length ? (
                    <span className="preview-stage-counter">
                      {formatImageCounter(language, previewIndex + 1, files.length)}
                    </span>
                  ) : null}
                </div>
              </div>
              <input
                ref={sourceFileInputRef}
                multiple
                accept="image/*"
                className="create-file-input-hidden"
                onChange={handleSourceFileChange}
                type="file"
              />
              {currentPreviewUrl ? (
                <>
                  <div
                    className={isSourceDropActive ? "preview-stage is-drop-active" : "preview-stage"}
                    onDragEnter={handleSourceDragEnter}
                    onDragLeave={handleSourceDragLeave}
                    onDragOver={handleSourceDragOver}
                    onDrop={handleSourceDrop}
                  >
                    <img
                      alt={files[previewIndex]?.name || text.livePreview}
                      className="preview-stage-image"
                      decoding="async"
                      src={currentPreviewUrl}
                    />
                    {previewUrls.length > 1 ? (
                      <>
                        <button aria-label={text.previousImage} className="preview-arrow preview-arrow-left" onClick={showPreviousPreview} type="button">
                          {"<"}
                        </button>
                        <button aria-label={text.nextImage} className="preview-arrow preview-arrow-right" onClick={showNextPreview} type="button">
                          {">"}
                        </button>
                      </>
                    ) : null}
                  </div>
                  {previewUrls.length > 1 ? (
                    <div className="preview-thumb-row" role="tablist" aria-label={text.livePreview}>
                      {previewUrls.map((url, index) => (
                        <button
                          aria-label={files[index]?.name || `${text.livePreview} ${index + 1}`}
                          className={index === previewIndex ? "preview-thumb is-active" : "preview-thumb"}
                          key={`${files[index]?.name || "image"}-${index}`}
                          onClick={() => setPreviewIndex(index)}
                          type="button"
                        >
                          <img alt={files[index]?.name || text.livePreview} decoding="async" loading="lazy" src={url} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div
                  className={isSourceDropActive ? "preview-stage preview-stage-empty is-drop-active" : "preview-stage preview-stage-empty"}
                  onDragEnter={handleSourceDragEnter}
                  onDragLeave={handleSourceDragLeave}
                  onDragOver={handleSourceDragOver}
                  onDrop={handleSourceDrop}
                >
                  <div className="preview-stage-empty-content">
                    <p className="helper">{text.dropToUpload}</p>
                    <p className="helper">{text.livePreviewEmpty}</p>
                  </div>
                </div>
              )}
            </section>

            {payload.creationMode === "reference-remix" ? (
              <section className="panel create-panel create-reference-panel">
                <div className="split-header compact">
                  <div>
                    <h2>{text.referenceImages}</h2>
                  </div>
                  <div className="create-panel-actions">
                    <button className="preview-stage-upload-button" onClick={openReferenceFilePicker} type="button">
                      {text.chooseFiles}
                    </button>
                    {referenceFiles.length ? (
                      <span className="preview-stage-counter">
                        {formatImageCounter(language, referencePreviewIndex + 1, referenceFiles.length)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <input
                  ref={referenceFileInputRef}
                  multiple
                  accept="image/*"
                  className="create-file-input-hidden"
                  onChange={handleReferenceFileChange}
                  type="file"
                />
                {currentReferencePreviewUrl ? (
                  <>
                    <div
                      className={isReferenceDropActive ? "preview-stage is-drop-active" : "preview-stage"}
                      onDragEnter={handleReferenceDragEnter}
                      onDragLeave={handleReferenceDragLeave}
                      onDragOver={handleReferenceDragOver}
                      onDrop={handleReferenceDrop}
                    >
                      <img
                        alt={referenceFiles[referencePreviewIndex]?.name || text.referenceImages}
                        className="preview-stage-image"
                        decoding="async"
                        src={currentReferencePreviewUrl}
                      />
                      {referencePreviewUrls.length > 1 ? (
                        <>
                          <button aria-label={text.previousImage} className="preview-arrow preview-arrow-left" onClick={showPreviousReferencePreview} type="button">
                            {"<"}
                          </button>
                          <button aria-label={text.nextImage} className="preview-arrow preview-arrow-right" onClick={showNextReferencePreview} type="button">
                            {">"}
                          </button>
                        </>
                      ) : null}
                    </div>
                    {referencePreviewUrls.length > 1 ? (
                      <div className="preview-thumb-row" role="tablist" aria-label={text.referenceImages}>
                        {referencePreviewUrls.map((url, index) => (
                          <button
                            aria-label={referenceFiles[index]?.name || `${text.referenceImages} ${index + 1}`}
                            className={index === referencePreviewIndex ? "preview-thumb is-active" : "preview-thumb"}
                            key={`${referenceFiles[index]?.name || "reference"}-${index}`}
                            onClick={() => setReferencePreviewIndex(index)}
                            type="button"
                          >
                            <img alt={referenceFiles[index]?.name || text.referenceImages} decoding="async" loading="lazy" src={url} />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div
                    className={isReferenceDropActive ? "preview-stage preview-stage-empty is-drop-active" : "preview-stage preview-stage-empty"}
                    onDragEnter={handleReferenceDragEnter}
                    onDragLeave={handleReferenceDragLeave}
                    onDragOver={handleReferenceDragOver}
                    onDrop={handleReferenceDrop}
                  >
                    <div className="preview-stage-empty-content">
                      <p className="helper">{text.dropToUpload}</p>
                      <p className="helper">{text.referencePreviewEmpty}</p>
                    </div>
                  </div>
                )}
              </section>
            ) : null}

            {payload.creationMode !== "prompt" && payload.creationMode !== "reference-remix" ? (
              <section className="panel create-panel create-mode-panel">
                <dl className="create-mode-panel-meta">
                  <div>
                    <dt>{language === "zh" ? "平台" : "Platform"}</dt>
                    <dd>
                      {payload.creationMode === "amazon-a-plus" ? (
                        currentPlatformLabel
                      ) : (
                        <select
                          className="create-mode-panel-select"
                          value={payload.platform}
                          onChange={(event) => setPayload((current) => ({ ...current, platform: event.target.value }))}
                        >
                          {PLATFORMS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label[language]}
                            </option>
                          ))}
                        </select>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{language === "zh" ? "国家 / 语言" : "Country / language"}</dt>
                    <dd className="create-mode-panel-market">
                      <div className="create-mode-panel-market-grid">
                        <select
                          className="create-mode-panel-select"
                          value={payload.country}
                          onChange={(event) =>
                            setPayload((current) => ({
                              ...current,
                              country: event.target.value,
                            }))
                          }
                        >
                          {COUNTRIES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label[language]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="create-mode-panel-select"
                          value={payload.language}
                          onChange={(event) =>
                            setPayload((current) => ({
                              ...current,
                              language: event.target.value,
                            }))
                          }
                        >
                          {OUTPUT_LANGUAGES.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label[language]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}
          </div>
        </aside>

        <div className="create-main stack gap-24">
          <div className="create-primary-grid">
        <section className="panel create-panel create-base-panel">
          <div className="create-base-mode-strip">{creationModeSelector}</div>
          <div className={payload.creationMode === "reference-remix" ? "create-base-grid is-remix-layout" : "create-base-grid"}>
              <div className="create-base-fields">
              {payload.creationMode === "prompt" ? (
                <>
                  <label>
                    <span>{text.customPrompt}</span>
                    <textarea
                      ref={customPromptInputRef}
                      required
                      rows={promptRows}
                      value={payload.customPrompt}
                      onChange={(event) => setPayload((current) => ({ ...current, customPrompt: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>{text.customNegativePrompt}</span>
                    <textarea
                      rows={mediumRows}
                      value={payload.customNegativePrompt}
                      onChange={(event) =>
                        setPayload((current) => ({
                          ...current,
                          customNegativePrompt: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="checkbox-row helper-toggle-row">
                    <input
                      checked={payload.translatePromptToOutputLanguage}
                      type="checkbox"
                      onChange={(event) =>
                        setPayload((current) => ({
                          ...current,
                          translatePromptToOutputLanguage: event.target.checked,
                        }))
                      }
                    />
                    <span>{text.translatePromptToOutputLanguage}</span>
                  </label>
                  <label className="checkbox-row helper-toggle-row">
                    <input
                      checked={payload.autoOptimizePrompt}
                      type="checkbox"
                      onChange={(event) =>
                        setPayload((current) => ({
                          ...current,
                          autoOptimizePrompt: event.target.checked,
                        }))
                      }
                    />
                    <span>{text.autoOptimizePrompt}</span>
                  </label>
                </>
              ) : null}
              {payload.creationMode === "suite" ? (
                <>
                  <label>
                    <span>{text.category}</span>
                    <select value={payload.category} onChange={(event) => setPayload({ ...payload, category: event.target.value })}>
                      {PRODUCT_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label[language]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{text.brandName}</span>
                    <input
                      list="brand-library-options"
                      value={payload.brandName}
                      onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                    />
                    <datalist id="brand-library-options">
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.name} />
                      ))}
                    </datalist>
                    <small className="helper">{text.brandLibraryHint}</small>
                  </label>
                  <label>
                    <span>{suiteSellingPointsLabel}</span>
                    <textarea
                      ref={suiteSellingPointsInputRef}
                      rows={longRows}
                      value={payload.sellingPoints}
                      onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{suiteMaterialLabel}</span>
                    <textarea
                      ref={suiteMaterialInfoInputRef}
                      rows={mediumRows}
                      value={payload.materialInfo}
                      onChange={(event) => setPayload({ ...payload, materialInfo: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{suiteSizeLabel}</span>
                    <textarea
                      ref={suiteSizeInfoInputRef}
                      rows={mediumRows}
                      value={payload.sizeInfo}
                      onChange={(event) => setPayload({ ...payload, sizeInfo: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{text.sourceDescription}</span>
                    <textarea rows={mediumRows} value={payload.sourceDescription} onChange={(event) => setPayload({ ...payload, sourceDescription: event.target.value })} />
                    <small className="helper">{suiteModeHint}</small>
                  </label>
                </>
              ) : null}
              {payload.creationMode === "amazon-a-plus" ? (
                <>
                  <label>
                    <span>{amazonAPlusProductLabel}</span>
                    <input
                      ref={productNameInputRef}
                      value={payload.productName}
                      onChange={(event) => setPayload({ ...payload, productName: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{text.brandName}</span>
                    <input
                      list="brand-library-options"
                      value={payload.brandName}
                      onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                    />
                    <datalist id="brand-library-options">
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.name} />
                      ))}
                    </datalist>
                    <small className="helper">{text.brandLibraryHint}</small>
                  </label>
                  <label>
                    <span>{text.category}</span>
                    <select value={payload.category} onChange={(event) => setPayload({ ...payload, category: event.target.value })}>
                      {PRODUCT_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label[language]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{amazonAPlusSellingPointsLabel}</span>
                    <textarea rows={mediumRows} value={payload.sellingPoints} onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })} />
                  </label>
                  <label>
                    <span>{amazonAPlusSourceDescriptionLabel}</span>
                    <textarea rows={mediumRows} value={payload.sourceDescription} onChange={(event) => setPayload({ ...payload, sourceDescription: event.target.value })} />
                    <small className="helper">{amazonAPlusContextHint}</small>
                  </label>
                </>
              ) : null}
              {payload.creationMode === "standard" ? (
                <>
                  <label>
                    <span>{text.productName}</span>
                    <input
                      ref={productNameInputRef}
                      required
                      value={payload.productName}
                      onChange={(event) => setPayload({ ...payload, productName: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>{text.brandName}</span>
                    <input
                      list="brand-library-options"
                      value={payload.brandName}
                      onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                    />
                    <datalist id="brand-library-options">
                      {brands.map((brand) => (
                        <option key={brand.id} value={brand.name} />
                      ))}
                    </datalist>
                    <small className="helper">{text.brandLibraryHint}</small>
                  </label>
                  <label>
                    <span>{text.category}</span>
                    <select value={payload.category} onChange={(event) => setPayload({ ...payload, category: event.target.value })}>
                      {PRODUCT_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label[language]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{text.sellingPoints}</span>
                    <textarea rows={longRows} value={payload.sellingPoints} onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.restrictions}</span>
                    <textarea rows={mediumRows} value={payload.restrictions} onChange={(event) => setPayload({ ...payload, restrictions: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.sourceDescription}</span>
                    <textarea rows={mediumRows} value={payload.sourceDescription} onChange={(event) => setPayload({ ...payload, sourceDescription: event.target.value })} />
                  </label>
                </>
              ) : null}
              {payload.creationMode === "reference-remix" ? (
                <>
                  {payload.referenceCopyMode === "copy-sheet" ? (
                    <>
                      <label>
                        <span>{text.productName}</span>
                        <input
                          ref={productNameInputRef}
                          value={payload.productName}
                          onChange={(event) => setPayload({ ...payload, productName: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>{text.brandName}</span>
                        <input
                          list="brand-library-options"
                          value={payload.brandName}
                          onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                        />
                        <datalist id="brand-library-options">
                          {brands.map((brand) => (
                            <option key={brand.id} value={brand.name} />
                          ))}
                        </datalist>
                      </label>
                      <label>
                        <span>{text.sellingPoints}</span>
                        <textarea rows={longRows} value={payload.sellingPoints} onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })} />
                      </label>
                      <label>
                        <span>{text.sourceDescription}</span>
                        <textarea rows={mediumRows} value={payload.sourceDescription} onChange={(event) => setPayload({ ...payload, sourceDescription: event.target.value })} />
                      </label>
                      <label>
                        <span>{text.referenceExtraPrompt}</span>
                        <textarea
                          rows={mediumRows}
                          value={payload.referenceExtraPrompt}
                          onChange={(event) => setPayload({ ...payload, referenceExtraPrompt: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>{text.referenceNegativePrompt}</span>
                        <textarea
                          rows={mediumRows}
                          value={payload.referenceNegativePrompt}
                          onChange={(event) => setPayload({ ...payload, referenceNegativePrompt: event.target.value })}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        <span>{text.sourceDescription}</span>
                        <textarea rows={mediumRows} value={payload.sourceDescription} onChange={(event) => setPayload({ ...payload, sourceDescription: event.target.value })} />
                      </label>
                      <label>
                        <span>{text.referenceExtraPrompt}</span>
                        <textarea
                          rows={mediumRows}
                          value={payload.referenceExtraPrompt}
                          onChange={(event) => setPayload({ ...payload, referenceExtraPrompt: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>{text.referenceNegativePrompt}</span>
                        <textarea
                          rows={mediumRows}
                          value={payload.referenceNegativePrompt}
                          onChange={(event) => setPayload({ ...payload, referenceNegativePrompt: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                </>
              ) : null}
              </div>
              <aside className="create-base-side">
                <div className="create-base-side-stack">
                  {payload.creationMode === "reference-remix" ? (
                    <div className="create-remix-control-stack">
                      <div className="create-remix-control-row create-remix-control-row-top">
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceRemakeGoal}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-4">
                            {referenceRemakeGoalOptions.map((option) => (
                              <label className={payload.referenceRemakeGoal === option.value ? "chip is-active" : "chip"} key={option.value}>
                                <input
                                  checked={payload.referenceRemakeGoal === option.value}
                                  name="reference-remake-goal"
                                  onChange={() => setPayload((current) => ({ ...current, referenceRemakeGoal: option.value }))}
                                  type="radio"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceStrength}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-3">
                            {referenceStrengthOptions.map((option) => (
                              <label className={payload.referenceStrength === option.value ? "chip is-active" : "chip"} key={option.value}>
                                <input
                                  checked={payload.referenceStrength === option.value}
                                  name="reference-strength"
                                  onChange={() => setPayload((current) => ({ ...current, referenceStrength: option.value }))}
                                  type="radio"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                      <div className="create-remix-control-row create-remix-control-row-secondary">
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceCompositionLock}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-3">
                            {referenceCompositionLockOptions.map((option) => (
                              <label className={payload.referenceCompositionLock === option.value ? "chip is-active" : "chip"} key={option.value}>
                                <input
                                  checked={payload.referenceCompositionLock === option.value}
                                  name="reference-composition-lock"
                                  onChange={() => setPayload((current) => ({ ...current, referenceCompositionLock: option.value }))}
                                  type="radio"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceVariants}</legend>
                          <div className="chip-grid small create-remix-variants-grid">
                            {remixVariantOptions.map((option) => (
                              <label className={payload.variantsPerType === option ? "chip is-active" : "chip"} key={option}>
                                <input
                                  checked={payload.variantsPerType === option}
                                  name="reference-variants"
                                  onChange={() => {
                                    setPayload((current) => ({ ...current, variantsPerType: option }));
                                    setVariantsInput(String(option));
                                  }}
                                  type="radio"
                                />
                                <span>{option}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                      <div className="create-remix-control-row create-remix-control-row-tertiary">
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceCopyMode}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-2">
                            <label className={payload.referenceCopyMode === "reference" ? "chip is-active" : "chip"}>
                              <input
                                checked={payload.referenceCopyMode === "reference"}
                                name="reference-copy-mode"
                                onChange={() => setPayload((current) => ({ ...current, referenceCopyMode: "reference" }))}
                                type="radio"
                              />
                              <span>{text.referenceCopyModeReference}</span>
                            </label>
                            <label className={payload.referenceCopyMode === "copy-sheet" ? "chip is-active" : "chip"}>
                              <input
                                checked={payload.referenceCopyMode === "copy-sheet"}
                                name="reference-copy-mode"
                                onChange={() => setPayload((current) => ({ ...current, referenceCopyMode: "copy-sheet" }))}
                                type="radio"
                              />
                              <span>{text.referenceCopyModeCopySheet}</span>
                            </label>
                          </div>
                        </fieldset>
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.preserveReferenceText}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-2">
                            {referenceTextPreservationOptions.map((option) => (
                              <label className={option.checked ? "chip is-active" : "chip"} key={option.value}>
                                <input
                                  checked={option.checked}
                                  name="reference-text-preservation"
                                  onChange={() =>
                                    setPayload((current) => ({
                                      ...current,
                                      preserveReferenceText: option.value === "keep",
                                    }))
                                  }
                                  type="radio"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                      <div className="create-remix-control-row create-remix-control-row-quaternary">
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceTextRegionPolicy}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-3">
                            {referenceTextRegionPolicyOptions.map((option) => (
                              <label className={payload.referenceTextRegionPolicy === option.value ? "chip is-active" : "chip"} key={option.value}>
                                <input
                                  checked={payload.referenceTextRegionPolicy === option.value}
                                  name="reference-text-region-policy"
                                  onChange={() => setPayload((current) => ({ ...current, referenceTextRegionPolicy: option.value }))}
                                  type="radio"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset className="create-generation-fieldset create-generation-fieldset-remix">
                          <legend>{text.referenceBackgroundMode}</legend>
                          <div className="chip-grid small create-remix-control-grid create-remix-control-grid-3">
                            {referenceBackgroundOptions.map((option) => (
                              <label className={payload.referenceBackgroundMode === option.value ? "chip is-active" : "chip"} key={option.value}>
                                <input
                                  checked={payload.referenceBackgroundMode === option.value}
                                  name="reference-background-mode"
                                  onChange={() => setPayload((current) => ({ ...current, referenceBackgroundMode: option.value }))}
                                  type="radio"
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                      <div className="create-remix-control-row create-remix-control-row-bottom">
                        <fieldset className="create-generation-fieldset create-generation-fieldset-ratios">
                          <legend>
                            <span>{text.ratios}</span>
                            <span className="create-generation-legend-note">({selectedRatioDirection})</span>
                          </legend>
                          <div className="chip-grid chip-grid-ratios small">
                            {ASPECT_RATIOS.map((option) => (
                              <label className={selectedRatios.includes(option.value) ? "chip is-active" : "chip"} key={option.value}>
                                <input checked={selectedRatios.includes(option.value)} onChange={() => selectSingle(option.value, setSelectedRatios)} type="checkbox" />
                                <span>{option.value}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset className="create-generation-fieldset create-generation-fieldset-resolutions">
                          <legend>
                            <span>{text.resolutions}</span>
                            <span className="create-generation-legend-note">({selectedResolutionDetail})</span>
                          </legend>
                          <div className="chip-grid chip-grid-resolutions small">
                            {resolutionOptions.map((option) => (
                              <label className={selectedResolutions.includes(option.value) ? "chip is-active" : "chip"} key={option.value}>
                                <input checked={selectedResolutions.includes(option.value)} onChange={() => selectSingle(option.value, setSelectedResolutions)} type="checkbox" />
                              <span>{option.label[language]}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      </div>
                    </div>
                  ) : payload.creationMode === "standard" ? (
                    <fieldset className="create-generation-fieldset create-generation-fieldset-types">
                      <legend>{text.imageTypes}</legend>
                      <div className="chip-grid chip-grid-types">
                        {IMAGE_TYPE_OPTIONS.map((option) => (
                          <label className={selectedTypes.includes(option.value) ? "chip is-active" : "chip"} key={option.value}>
                            <input checked={selectedTypes.includes(option.value)} onChange={() => toggleSelection(option.value, selectedTypes, setSelectedTypes)} type="checkbox" />
                            <span>{option.label[language]}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ) : payload.creationMode === "suite" ? (
                    <fieldset className="create-generation-fieldset create-generation-fieldset-types">
                      <legend>{text.imageTypes}</legend>
                      <div className="chip-grid chip-grid-types">
                        {SUITE_SELECTED_TYPES.map((imageType) => (
                          <span className="chip is-active" key={imageType}>
                            <span>{labelFor(imageType, language, IMAGE_TYPE_OPTIONS)}</span>
                          </span>
                        ))}
                      </div>
                    </fieldset>
                  ) : payload.creationMode === "amazon-a-plus" ? (
                    <fieldset className="create-generation-fieldset create-generation-fieldset-types">
                      <legend>{text.imageTypes}</legend>
                      <div className="chip-grid chip-grid-types">
                        {AMAZON_A_PLUS_SELECTED_TYPES.map((imageType) => (
                          <span className="chip is-active" key={imageType}>
                            <span>{labelFor(imageType, language, IMAGE_TYPE_OPTIONS)}</span>
                          </span>
                        ))}
                      </div>
                    </fieldset>
                  ) : null}
                  {payload.creationMode !== "reference-remix" ? (
                    <>
                      <fieldset className="create-generation-fieldset create-generation-fieldset-ratios">
                        <legend>
                          <span>{text.ratios}</span>
                          <span className="create-generation-legend-note">({selectedRatioDirection})</span>
                        </legend>
                        <div className="chip-grid chip-grid-ratios small">
                          {ASPECT_RATIOS.map((option) => (
                            <label className={selectedRatios.includes(option.value) ? "chip is-active" : "chip"} key={option.value}>
                              <input checked={selectedRatios.includes(option.value)} onChange={() => selectSingle(option.value, setSelectedRatios)} type="checkbox" />
                              <span>{option.value}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset className="create-generation-fieldset create-generation-fieldset-resolutions">
                        <legend>
                          <span>{text.resolutions}</span>
                          <span className="create-generation-legend-note">({selectedResolutionDetail})</span>
                        </legend>
                        <div className="chip-grid chip-grid-resolutions small">
                          {resolutionOptions.map((option) => (
                            <label className={selectedResolutions.includes(option.value) ? "chip is-active" : "chip"} key={option.value}>
                              <input checked={selectedResolutions.includes(option.value)} onChange={() => selectSingle(option.value, setSelectedResolutions)} type="checkbox" />
                              <span>{option.label[language]}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    </>
                  ) : null}
                </div>
                <div className={payload.creationMode === "reference-remix" ? "create-quantity-submit-group create-quantity-submit-group-inline is-remix-mode" : "create-quantity-submit-group create-quantity-submit-group-inline"}>
                  {payload.creationMode !== "reference-remix" ? (
                    <label className="create-quantity-field create-quantity-card">
                      <span>
                        {payload.creationMode === "suite"
                          ? suiteQuantityLabel
                          : payload.creationMode === "amazon-a-plus"
                            ? language === "zh"
                              ? "每个模块生成数量"
                              : "Per-module count"
                            : text.variants}
                      </span>
                      <input
                        ref={variantsInputRef}
                        min={1}
                        max={10}
                        step={1}
                        inputMode="numeric"
                        type="number"
                        value={variantsInput}
                        aria-invalid={Boolean(variantsValidationMessage)}
                        onBlur={() => {
                          if (parsedVariantsPerType !== null) {
                            setVariantsInput(String(parsedVariantsPerType));
                          }
                        }}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setVariantsInput(nextValue);

                          const nextParsedValue = parseVariantsPerTypeInput(nextValue);
                          if (nextParsedValue !== null) {
                            setPayload((current) => ({
                              ...current,
                              variantsPerType: nextParsedValue,
                            }));
                          }
                        }}
                      />
                      {variantsValidationMessage ? <small className="helper error-text">{variantsValidationMessage}</small> : null}
                    </label>
                  ) : null}
                  <div className={payload.creationMode === "reference-remix" ? "create-submit-card create-submit-card-metric create-submit-card-metric-primary create-submit-card-metric-remix" : "create-submit-card create-submit-card-metric create-submit-card-metric-primary"}>
                    <span className="create-submit-card-label">{actualGenerationLabel}</span>
                    <strong className="create-submit-card-value">{requestCountValue}</strong>
                    <p className="create-submit-card-formula-inline" title={formulaDisplay}>
                      {formulaDisplay}
                    </p>
                    {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
                    <button
                      aria-disabled={isPending || isSubmitBlocked}
                      className={[
                        "primary-button",
                        "create-submit-primary",
                        isSubmitBlocked ? "is-blocked" : "",
                        submitBlockedFeedback ? "is-shaking" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={isPending}
                      onClick={isSubmitBlocked ? () => triggerSubmitBlockedFeedback(submitBlockReason!) : undefined}
                      title={isSubmitBlocked ? submitBlockedMessage : undefined}
                      type={isSubmitBlocked ? "button" : "submit"}
                    >
                      {isPending ? text.submitting : text.submit}
                    </button>
                  </div>
                </div>
              </aside>
            </div>
        </section>
          </div>
        </div>
      </form>

      {submittedJobId ? (
        <div className="success-modal-backdrop" role="presentation">
          <section aria-modal="true" className="success-modal" role="dialog" aria-labelledby="create-success-title">
            <p className="eyebrow success-text">{text.submitSuccessTitle}</p>
            <h3 id="create-success-title">{text.submitSuccessTitle}</h3>
            <div className="button-row success-modal-actions">
              <button className="ghost-button" onClick={handleContinueCreate} type="button">
                {text.continueCreate}
              </button>
              <button className="primary-button" onClick={handleViewResults} type="button">
                {text.viewResults}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

