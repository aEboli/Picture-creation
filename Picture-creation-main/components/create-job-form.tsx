"use client";

import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  ASPECT_RATIOS,
  COUNTRIES,
  getDefaultCountryForLanguage,
  getDefaultLanguageForCountry,
  IMAGE_TYPE_OPTIONS,
  normalizeSelectedResolutions,
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
  | "suite-source-limit"
  | "suite-selling-points"
  | "suite-material"
  | "suite-size"
  | "amazon-a-plus-source-limit"
  | "reference-source-limit"
  | "reference-reference-limit";

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
  "1:4": { zh: "竖长图", en: "Tall portrait" },
  "1:8": { zh: "超竖图", en: "Ultra portrait" },
  "3:2": { zh: "横图", en: "Landscape" },
  "2:3": { zh: "竖图", en: "Portrait" },
  "3:4": { zh: "竖图", en: "Portrait" },
  "4:1": { zh: "超宽图", en: "Ultra wide" },
  "4:3": { zh: "横图", en: "Landscape" },
  "4:5": { zh: "竖图", en: "Portrait" },
  "5:4": { zh: "横图", en: "Landscape" },
  "8:1": { zh: "横幅图", en: "Banner wide" },
  "9:16": { zh: "竖长图", en: "Vertical" },
  "16:9": { zh: "宽屏", en: "Widescreen" },
  "21:9": { zh: "电影宽屏", en: "Cinematic" },
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
  promptInputs: [""],
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
      brandLibraryHint: "输入品牌名，或从品牌库中选择一个。",
      brandName: "品牌名",
      category: "品类",
      clearDraft: "清空已填内容",
      continueCreate: "继续创作",
      promptInput: "提示词",
      addPromptInput: "新增提示词",
      removePromptInput: "移除",
      chooseFiles: "选择文件",
      dropToReplace: "拖拽图片到这里即可替换",
      dropToUpload: "或将图片拖到这里上传",
      filesRequired: "请至少上传 1 张图片。",
      generationSemanticsBatch: "批量模板",
      generationSemanticsJoint: "多图联合",
      generationSemanticsLabel: "生成方式",
      generateError: "提交失败。请检查表单和 API 配置后重试。",
      hint: "在原图面板中切换多图联合生成和批量模板任务。",
      imageCounter: "{current}/{total}",
      imageTypes: "图片类型",
      leavePrompt: "当前草稿尚未完成。离开此页后，需要重新选择已上传的图片。仍要离开吗？",
      livePreview: "实时预览",
      livePreviewEmpty: "上传图片后会在这里显示实时预览。",
      nextImage: "下一张",
      previousImage: "上一张",
      productName: "图片名",
      promptMode: "提示词模式",
      promptModePanelHintNoSources: "未上传原图时可直接执行文生图。",
      promptModePanelHintWithSources: "上传多张原图后会合并为联合参考输入，每条提示词产出 1 张图片。",
      promptRequired: "提示词模式下至少需要填写 1 条提示词。",
      quantityPending: "待填写",
      quantityRangeError: "数量必须是 1 到 10 之间的整数。",
      quantityRequired: "请先输入数量。",
      ratios: "比例",
      recommendationApplied: "已应用推荐配置",
      referenceFilesRequired: "参考图复刻模式下请至少上传 1 张参考图。",
      referenceImages: "参考图",
      referenceMode: "参考图复刻",
      referencePreviewEmpty: "上传参考图后会在这里预览。",
      requestCountBreakdown: "公式：原图 {sources} × 类型 {types} × 比例 {ratios} × 分辨率 {resolutions} × 数量 {variants}。",
      requestCountPendingBreakdown: "在计算请求总数前，需要先填写 1 到 10 之间的整数数量。",
      requestCountPendingSummary: "请先输入有效数量（1-10）。",
      requestCountSummary: "本次任务将发起 {count} 次图片请求。",
      resolutions: "分辨率",
      restrictions: "限制词 / 禁止内容",
      sellingPoints: "卖点",
      sourceDescription: "补充说明",
      sourceImages: "图片原图",
      standardMode: "标准模式",
      submit: "提交任务",
      submitSuccessTitle: "任务创建成功",
      submitting: "提交中...",
      translatePromptToOutputLanguage: "翻译为输出语言",
      typesUnit: "个类型",
      variants: "数量",
      viewResults: "查看结果",
      wildcard: "全部",
    };
  }

  return {
    autoOptimizePrompt: "Optimize for realistic photos",
    brandLibraryHint: "Type a brand name or choose one from the brand library.",
    brandName: "Brand name",
    category: "Category",
    clearDraft: "Clear filled data",
    continueCreate: "Continue",
    promptInput: "Prompt",
    addPromptInput: "Add prompt",
    removePromptInput: "Remove",
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
    promptModePanelHintNoSources: "With no source images uploaded, prompt mode supports text-to-image generation.",
    promptModePanelHintWithSources: "When multiple source images are uploaded, they are treated as a joint reference input and each prompt generates one image.",
    promptRequired: "At least one prompt is required in prompt mode.",
    quantityPending: "Pending",
    quantityRangeError: "Quantity must be an integer from 1 to 10.",
    quantityRequired: "Enter a quantity first.",
    ratios: "Ratios",
    recommendationApplied: "Recommended setup applied",
    referenceFilesRequired: "Upload at least one reference image in remake mode.",
    referenceImages: "Reference images",
    referenceMode: "Reference remake",
    referencePreviewEmpty: "Upload a reference image to preview it here.",
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
    wildcard: "All",
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

function normalizePromptInputs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [""];
  }

  const normalized = value.filter((item): item is string => typeof item === "string");
  return normalized.length ? normalized : [""];
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
      ? "套图模式仅支持 1 张原图，并固定生成 6 个模块。"
      : "Suite mode supports exactly 1 source image and always generates the fixed 6-image module set.";
  const suiteModulesSummary =
    language === "zh"
      ? "仅支持 1 张原图。固定覆盖：主图、生活方式图、卖点总览、场景图、材质工艺图和尺寸参数图。"
      : "Supports exactly 1 source image. Fixed coverage: main image, lifestyle, feature overview, scene, material & craft, and size spec.";
  const suiteMaterialLabel = language === "zh" ? "材质（必填）" : "Material (required)";
  const suiteSizeLabel = language === "zh" ? "尺寸 / 规格（必填）" : "Size / dimensions (required)";
  const suiteSellingPointsLabel = language === "zh" ? "卖点（必填）" : "Selling points (required)";
  const suiteQuantityLabel = language === "zh" ? "套图数量" : "Set count";
  const suiteModeRequiredHint =
    language === "zh" ? "套图模式需要品类、卖点、材质和尺寸。" : "Image set mode requires category, selling points, material, and size.";
  const amazonAPlusModeLabel = language === "zh" ? "亚马逊 A+" : "Amazon A+";
  const amazonAPlusModeHint =
    language === "zh"
      ? "亚马逊 A+ 模式仅支持 1 张原图，并固定生成 6 个 A+ 模块。"
      : "Amazon A+ mode supports exactly 1 source image and always generates the fixed 6-module A+ set.";
  const amazonAPlusLockedPlatformHint = language === "zh" ? "A+ 模式已锁定为 Amazon 平台。" : "A+ mode is locked to Amazon.";
  const amazonAPlusContextHint =
    language === "zh"
      ? "可补充商品名、品牌、卖点和备注，让 A+ 模块更完整。"
      : "Optionally add product name, brand, selling points, and notes for more complete A+ modules.";
  const amazonAPlusModulesSummary =
    language === "zh"
      ? "仅支持 1 张原图。固定覆盖：海报、卖点总览、多场景、细节、尺寸参数和文化价值。"
      : "Supports exactly 1 source image. Fixed coverage: poster, feature overview, multi-scene, detail, size spec, and culture value.";
  const suiteModeInfoText =
    language === "zh"
      ? "套图模式仅支持 1 张原图，超过 1 张原图无法提交。"
      : "Suite mode only supports exactly 1 source image. More than 1 source image cannot be submitted.";
  const amazonAPlusModeInfoText =
    language === "zh"
      ? "亚马逊 A+ 模式仅支持 1 张原图，超过 1 张原图无法提交。"
      : "Amazon A+ mode only supports exactly 1 source image. More than 1 source image cannot be submitted.";
  const referenceRemixModeInfoText =
    language === "zh"
      ? "仅支持 1 张原图 + 1 张参考图，然后执行两阶段 JSON -> 中文提示词工作流。"
      : "Supports exactly 1 source image + 1 reference image, then runs a two-stage JSON -> Chinese prompt workflow.";
  const referenceRemixWorkflowSummary =
    language === "zh"
      ? "原图保持主体真实性，参考图只提供构图、光线、场景语言和视觉表达线索。"
      : "The source image remains the subject truth, while the reference image only provides composition, lighting, scene language, and visual expression cues.";
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
  const promptInputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
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
  const isSingleSourceMode =
    payload.creationMode === "suite" || payload.creationMode === "amazon-a-plus" || payload.creationMode === "reference-remix";
  const isSingleReferenceMode = payload.creationMode === "reference-remix";
  const maxSourceImagesForSelection = useMemo(
    () =>
      isSingleSourceMode
        ? 1
        : getMaxSourceImagesForSelection(defaultImageModel, {
            generationSemantics: currentGenerationSemantics,
            referenceImageCount: currentReferenceImageCount,
          }),
    [currentGenerationSemantics, currentReferenceImageCount, defaultImageModel, isSingleSourceMode],
  );
  const maxReferenceImagesForSelection = useMemo(
    () =>
      isSingleReferenceMode
        ? 1
        : payload.creationMode === "reference-remix"
          ? getMaxReferenceImagesForSelection(defaultImageModel, {
              generationSemantics: currentGenerationSemantics,
              sourceImageCount: files.length,
            })
          : 0,
    [currentGenerationSemantics, defaultImageModel, files.length, isSingleReferenceMode, payload.creationMode],
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
    if (limit <= 0) {
      return language === "zh" ? "多图联合模式已没有原图名额了，请先减少参考图。" : "No source-image slots are left for joint generation. Reduce reference images first.";
    }

    return language === "zh" ? `当前生成方式最多支持 ${limit} 张原图。` : `The current generation mode supports up to ${limit} source images.`;
  }

  function buildReferenceLimitMessage(limit: number) {
    if (currentGenerationSemantics === "joint") {
      return limit <= 0
        ? language === "zh"
          ? "参考图名额已满，请先减少原图。"
          : "No reference-image slots are left. Reduce source images first."
        : language === "zh"
          ? `你还可以再添加 ${limit} 张参考图。`
          : `You can add up to ${limit} more reference images.`;
    }

    return language === "zh" ? `参考图复刻模式每次请求最多支持 ${limit} 张参考图。` : `Reference remake supports up to ${limit} reference images per request.`;
  }

  function buildImageLimitMessage() {
    return language === "zh"
      ? `当前选择会在一次请求中发送 ${currentRequestImageCount} 张图片，已超过模型 ${maxImagesPerPrompt} 张的限制。`
      : `The current selection would send ${currentRequestImageCount} images in one request, exceeding the ${maxImagesPerPrompt}-image model limit.`;
  }

  const parsedVariantsPerType = useMemo(() => parseVariantsPerTypeInput(variantsInput), [variantsInput]);
  const normalizedPromptInputs = useMemo(
    () => payload.promptInputs.map((input) => input.trim()).filter((input) => input.length > 0),
    [payload.promptInputs],
  );
  const promptModeHasFilledPrompt = normalizedPromptInputs.length > 0;
  const variantsValidationMessage = useMemo(() => {
    if (payload.creationMode === "prompt") {
      return "";
    }

    if (!variantsInput.trim()) {
      return text.quantityRequired;
    }

    return parsedVariantsPerType === null ? text.quantityRangeError : "";
  }, [parsedVariantsPerType, payload.creationMode, text.quantityRangeError, text.quantityRequired, variantsInput]);

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

    if (payload.creationMode === "prompt" && !promptModeHasFilledPrompt) {
      return "prompt";
    }

    if (payload.creationMode === "reference-remix" && !referenceFiles.length) {
      return "reference";
    }

    if (payload.creationMode === "suite" && files.length > 1) {
      return "suite-source-limit";
    }

    if (payload.creationMode === "amazon-a-plus" && files.length > 1) {
      return "amazon-a-plus-source-limit";
    }

    if (payload.creationMode === "reference-remix" && files.length > 1) {
      return "reference-source-limit";
    }

    if (payload.creationMode === "reference-remix" && referenceFiles.length > 1) {
      return "reference-reference-limit";
    }

    if (currentRequestImageCount > maxImagesPerPrompt) {
      return "image-limit";
    }

    if (payload.creationMode !== "prompt" && parsedVariantsPerType === null) {
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
    payload.materialInfo,
    payload.productName,
    payload.sellingPoints,
    payload.sizeInfo,
    parsedVariantsPerType,
    promptModeHasFilledPrompt,
    referenceFiles.length,
  ]);
  function getSubmitBlockedMessage(reason: SubmitBlockReason) {
    if (reason === "files") {
      return text.filesRequired;
    }

    if (reason === "prompt") {
      return text.promptRequired;
    }

    if (reason === "reference") {
      return text.referenceFilesRequired;
    }

    if (reason === "suite-source-limit") {
      return suiteModeInfoText;
    }

    if (reason === "amazon-a-plus-source-limit") {
      return amazonAPlusModeInfoText;
    }

    if (reason === "reference-source-limit") {
      return referenceRemixModeInfoText;
    }

    if (reason === "reference-reference-limit") {
      return referenceRemixModeInfoText;
    }

    if (reason === "image-limit") {
      return buildImageLimitMessage();
    }

    if (reason === "variants") {
      return variantsValidationMessage;
    }

    if (reason === "suite-selling-points" || reason === "suite-material" || reason === "suite-size") {
      return suiteModeRequiredHint;
    }

    if (reason === "product-name") {
      return language === "zh" ? "请先填写图片名。" : "Please fill in the image name first.";
    }

  return "";
  }
  const submitBlockedMessage = submitBlockReason ? getSubmitBlockedMessage(submitBlockReason) : "";
  const isSubmitBlocked = Boolean(submitBlockReason);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(CREATE_JOB_DRAFT_KEY);
      if (!rawDraft) {
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(rawDraft) as {
        payload?: (typeof INITIAL_PAYLOAD) & { customPrompt?: string; customNegativePrompt?: string; promptInputs?: string[] };
        selectedTypes?: string[];
        selectedRatios?: string[];
        selectedResolutions?: string[];
        autoLanguageByCountry?: boolean;
        promptMarketOverridesEnabled?: boolean;
        recommendationMessage?: string;
      };

      if (draft.payload) {
        const draftPayload = draft.payload;
        const migratedPromptInputs = normalizePromptInputs(
          Array.isArray(draftPayload.promptInputs) && draftPayload.promptInputs.length
            ? draftPayload.promptInputs
            : typeof draftPayload.customPrompt === "string" && draftPayload.customPrompt.trim()
              ? [draftPayload.customPrompt]
              : [""],
        );
        const {
          customPrompt: _legacyCustomPrompt,
          customNegativePrompt: _legacyCustomNegativePrompt,
          promptInputs: _draftPromptInputs,
          ...draftPayloadRest
        } = draftPayload;
        setPayload((current) => ({
          ...current,
          ...draftPayloadRest,
          promptInputs: migratedPromptInputs,
        }));
        setVariantsInput(String(draftPayload.variantsPerType ?? INITIAL_PAYLOAD.variantsPerType));
      }
      if (draft.selectedTypes?.length) {
        setSelectedTypes(draft.selectedTypes);
      }
      if (draft.selectedRatios?.length) {
        setSelectedRatios([draft.selectedRatios[0]]);
      }
      if (draft.selectedResolutions?.length) {
        const normalizedDraftResolutions = normalizeSelectedResolutions(draft.selectedResolutions);
        setSelectedResolutions([normalizedDraftResolutions[0]]);
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
    const nextResolutions = [normalizeSelectedResolutions(selectedResolutions)[0]];
    const hasChanged =
      nextResolutions.length !== selectedResolutions.length ||
      nextResolutions.some((value, index) => value !== selectedResolutions[index]);

    if (hasChanged) {
      setSelectedResolutions(nextResolutions);
    }
  }, [selectedResolutions]);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    const persistedSelectedResolutions = [normalizeSelectedResolutions(selectedResolutions)[0]];
    window.localStorage.setItem(
      CREATE_JOB_DRAFT_KEY,
      JSON.stringify({
        payload,
        selectedTypes,
        selectedRatios,
        selectedResolutions: persistedSelectedResolutions,
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

    const normalizedReferenceResolutions = [normalizeSelectedResolutions(selectedResolutions)[0]];
    const shouldUpdateReferenceResolutions =
      normalizedReferenceResolutions.length !== selectedResolutions.length ||
      normalizedReferenceResolutions.some((value, index) => value !== selectedResolutions[index]);
    if (shouldUpdateReferenceResolutions) {
      setSelectedResolutions(normalizedReferenceResolutions);
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

  function updatePromptInput(index: number, value: string) {
    setPayload((current) => ({
      ...current,
      promptInputs: current.promptInputs.map((promptInput, promptIndex) => (promptIndex === index ? value : promptInput)),
    }));
  }

  function addPromptInput() {
    setPayload((current) => ({
      ...current,
      promptInputs: [...current.promptInputs, ""],
    }));
  }

  function removePromptInput(index: number) {
    setPayload((current) => {
      if (current.promptInputs.length <= 1) {
        return current;
      }

      const nextPromptInputs = current.promptInputs.filter((_, promptIndex) => promptIndex !== index);
      return {
        ...current,
        promptInputs: nextPromptInputs.length ? nextPromptInputs : [""],
      };
    });
    promptInputRefs.current = promptInputRefs.current.filter((_, promptIndex) => promptIndex !== index);
  }

  function applySourceFiles(nextFiles: File[]) {
    const sourceLimit = isSingleSourceMode ? 1 : maxSourceImagesForSelection;
    const limitedFiles = Number.isFinite(sourceLimit) ? nextFiles.slice(0, sourceLimit) : nextFiles;
    if (limitedFiles.length < nextFiles.length) {
      setErrorMessage(buildSourceLimitMessage(Number.isFinite(sourceLimit) ? sourceLimit : nextFiles.length));
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
    const referenceLimit = isSingleReferenceMode ? 1 : maxReferenceImagesForSelection;
    const limitedFiles = nextFiles.slice(0, referenceLimit);
    if (nextFiles.length > referenceLimit) {
      setErrorMessage(buildReferenceLimitMessage(referenceLimit));
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
    setSelectedResolutions([normalizeSelectedResolutions(recommendation.selectedResolutions)[0]]);
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
      promptInputs: [""],
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

    if (reason === "suite-source-limit" || reason === "amazon-a-plus-source-limit" || reason === "reference-source-limit") {
      sourceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      sourceFileInputRef.current?.focus();
      return;
    }

    if (reason === "reference-reference-limit") {
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
        promptInputRefs.current[0]?.focus();
        promptInputRefs.current[0]?.select();
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
    setErrorMessage(getSubmitBlockedMessage(reason));
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

    const submitVariantsPerType = payload.creationMode === "prompt" ? 1 : parsedVariantsPerType;
    if (submitVariantsPerType === null) {
      triggerSubmitBlockedFeedback("variants");
      return;
    }

    const submitSelectedResolutions = [normalizeSelectedResolutions(selectedResolutions)[0]];
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
            promptInputs: payload.creationMode === "prompt" ? normalizedPromptInputs : undefined,
            customNegativePrompt: payload.creationMode === "prompt" ? undefined : (payload as { customNegativePrompt?: string }).customNegativePrompt,
            variantsPerType: submitVariantsPerType,
            selectedTypes: effectiveSelectedTypes,
            selectedRatios,
            selectedResolutions: submitSelectedResolutions,
            referenceRemakeGoal: undefined,
            referenceStrength: undefined,
            referenceCompositionLock: undefined,
            referenceTextRegionPolicy: undefined,
            referenceBackgroundMode: undefined,
            preserveReferenceText: undefined,
            referenceCopyMode: undefined,
            referenceExtraPrompt: undefined,
            referenceNegativePrompt: undefined,
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
        promptInputRefs.current[0]?.focus();
        promptInputRefs.current[0]?.select();
        return;
      }

      if (payload.creationMode === "reference-remix") {
        sourceFileInputRef.current?.focus();
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
  const generationSemanticsLabel =
    currentGenerationSemantics === "joint" ? text.generationSemanticsJoint : text.generationSemanticsBatch;
  const generationHint =
    payload.creationMode === "prompt"
      ? files.length === 0
        ? text.promptModePanelHintNoSources
        : text.promptModePanelHintWithSources
      : payload.creationMode === "suite"
        ? suiteModulesSummary
      : payload.creationMode === "amazon-a-plus"
        ? amazonAPlusModulesSummary
      : payload.creationMode === "reference-remix"
        ? referenceRemixModeInfoText
        : recommendationMessage || text.hint;
  const joinSummaryParts = (parts: Array<string | null | undefined>) =>
    parts
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" / ");
  const marketSummary =
    payload.creationMode === "reference-remix"
      ? joinSummaryParts([generationSemanticsLabel, selectedRatios[0], selectedResolutions[0], parsedVariantsPerType === null ? text.quantityPending : `${parsedVariantsPerType}`])
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
  const promptRequestCount =
    payload.creationMode === "prompt" && normalizedPromptInputs.length > 0
      ? normalizedPromptInputs.length * selectedRatios.length * selectedResolutions.length
      : null;
  const requestCount =
    payload.creationMode === "prompt"
      ? promptRequestCount
      : parsedVariantsPerType === null
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
  const selectedRatioDirection = language === "zh" ? "单选" : "Single select";
  const actualGenerationLabel = language === "zh" ? "实际生成数量" : "Actual outputs";
  const requestInputLabel =
    payload.creationMode === "prompt"
      ? files.length === 0
        ? language === "zh"
          ? "文生图输入"
          : "text-to-image input"
        : language === "zh"
          ? "联合参考输入"
          : "joint reference input"
      : currentGenerationSemantics === "joint"
        ? language === "zh"
          ? `${requestInputCount} 个多图联合输入组`
          : `${requestInputCount} joint input group`
        : language === "zh"
          ? `${requestInputCount} 张原图`
          : `${requestInputCount} source image`;
  const formulaDisplay =
    payload.creationMode === "prompt"
      ? language === "zh"
        ? `${requestInputLabel} × ${normalizedPromptInputs.length} 条提示词 × ${selectedRatios.length} 个比例 × ${selectedResolutions.length} 个分辨率`
        : `${requestInputLabel} x ${normalizedPromptInputs.length} prompt x ${selectedRatios.length} ratio x ${selectedResolutions.length} resolution`
      : language === "zh"
        ? `${requestInputLabel} × ${effectiveSelectedTypes.length} 个类型 × ${selectedRatios.length} 个比例 × ${selectedResolutions.length} 个分辨率 × ${parsedVariantsPerType ?? "-"} 个数量`
        : `${requestInputLabel} x ${effectiveSelectedTypes.length} type x ${selectedRatios.length} ratio x ${selectedResolutions.length} resolution x ${parsedVariantsPerType ?? "-"} qty`;
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
                multiple={!isSingleSourceMode}
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
                  multiple={!isSingleReferenceMode}
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
                  {payload.promptInputs.map((promptInput, promptIndex) => (
                    <label key={`prompt-input-${promptIndex}`}>
                      <span>{`${text.promptInput} ${promptIndex + 1}`}</span>
                      <textarea
                        ref={(element) => {
                          promptInputRefs.current[promptIndex] = element;
                        }}
                        rows={promptRows}
                        value={promptInput}
                        onChange={(event) => updatePromptInput(promptIndex, event.target.value)}
                      />
                      <div className="button-row">
                        <button
                          className="ghost-button"
                          disabled={payload.promptInputs.length <= 1}
                          onClick={() => removePromptInput(promptIndex)}
                          type="button"
                        >
                          {text.removePromptInput}
                        </button>
                      </div>
                    </label>
                  ))}
                  <div className="button-row">
                    <button className="ghost-button" onClick={addPromptInput} type="button">
                      {text.addPromptInput}
                    </button>
                  </div>
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
                    <small className="helper">{suiteModeInfoText}</small>
                    <small className="helper">{suiteModulesSummary}</small>
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
                    <small className="helper">{amazonAPlusModeInfoText}</small>
                    <small className="helper">{amazonAPlusModulesSummary}</small>
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
                <div className="create-mode-info-block create-mode-info-block-remix">
                  <p>{referenceRemixModeInfoText}</p>
                  <p>{referenceRemixWorkflowSummary}</p>
                </div>
              ) : null}
              </div>
              <aside className="create-base-side">
                <div className="create-base-side-stack">
                  {payload.creationMode === "reference-remix" ? (
                    <div className="create-mode-info-block create-mode-info-block-remix">
                      <p>{referenceRemixModeInfoText}</p>
                      <p>{referenceRemixWorkflowSummary}</p>
                    </div>
                  ) : null}
                  {payload.creationMode === "standard" ? (
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
                <div className={payload.creationMode === "reference-remix" ? "create-quantity-submit-group create-quantity-submit-group-inline is-remix-mode" : "create-quantity-submit-group create-quantity-submit-group-inline"}>
                  {payload.creationMode !== "reference-remix" && payload.creationMode !== "prompt" ? (
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





