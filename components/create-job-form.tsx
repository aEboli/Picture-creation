"use client";

import { type ChangeEvent, type CSSProperties, type DragEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { readBrowserApiSettings } from "@/lib/browser-api-settings";
import {
  ASPECT_RATIOS,
  COUNTRIES,
  getDefaultCountryForLanguage,
  getDefaultLanguageForCountry,
  IMAGE_TYPE_OPTIONS,
  normalizeSelectedResolutions,
  OUTPUT_LANGUAGES,
  PLATFORMS,
  RESOLUTIONS,
} from "@/lib/constants";
import { formatImageCounter } from "@/lib/create-form-copy";
import {
  createCreateDraftId,
  CREATE_JOB_DRAFT_KEY,
  readCreateDraftIdFromDraftJson,
} from "@/lib/create-agent-history";
import { resolveMappedPromptInputs } from "@/lib/create-agent-prompt-mapping";
import {
  AUTO_SOURCE_IMAGE_LIMIT,
  getPlannedRequestCount,
  getRequestImageCount,
  getRequestInputGroupCount,
  inferGenerationSemanticsFromSourceCount,
} from "@/lib/generation-semantics";
import { getMaxImagesPerPromptForModel } from "@/lib/image-model-limits";
import { getRecommendedCreateDefaults } from "@/lib/recommendations";
import type {
  BrandRecord,
  CreationMode,
  GenerationSemantics,
  UiLanguage,
} from "@/lib/types";
import { dimensionsForVariant } from "@/lib/utils";

type SubmitBlockReason =
  | "files"
  | "prompt"
  | "reference"
  | "image-limit"
  | "variants"
  | "product-name"
  | "suite-source-limit"
  | "amazon-a-plus-source-limit"
  | "reference-source-limit"
  | "reference-reference-limit";

type CreateAgentMappedFields = {
  productName?: string;
  sellingPoints?: string;
  materialInfo?: string;
  sizeInfo?: string;
  brandName?: string;
};

type CreateAgentMapDetail = {
  agentType?: "image-analyst" | "prompt-engineer";
  fields?: CreateAgentMappedFields;
  promptSuggestions?: string[];
};

type WorkbenchAreaKey = "assets" | "brief" | "settings" | "submit";

const CREATE_AGENT_DRAFT_CONTEXT_EVENT = "create-agent:draft-context";
const CREATE_FORM_MAPPING_EVENT = "create-agent:map-to-form";
const INITIAL_SELECTED_TYPES = ["scene", "detail", "pain-point"];
const SUITE_SELECTED_TYPES = ["main-image", "lifestyle", "feature-overview", "scene", "material-craft", "size-spec"];
const AMAZON_A_PLUS_SELECTED_TYPES = ["poster", "feature-overview", "multi-scene", "detail", "size-spec", "culture-value"];
const INITIAL_SELECTED_RATIOS = ["1:1"];
const INITIAL_SELECTED_RESOLUTIONS = ["1K"];
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
  strategyWorkflowMode: "quick" as const,
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
  temporaryApiHeaders: "",
  referenceExtraPrompt: "",
  referenceNegativePrompt: "",
  referenceLayoutOverrideJson: "",
  referencePosterCopyOverrideJson: "",
};

const CREATE_MODE_CLASS_NAMES: Record<CreationMode, string> = {
  standard: "is-standard-mode",
  suite: "is-suite-mode",
  "amazon-a-plus": "is-amazon-mode",
  prompt: "is-prompt-mode",
  "reference-remix": "is-reference-mode",
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
      generateError: "提交失败。请检查表单和 API 配置后重试。",
      apiKeyRequired: "请先填写浏览器 API Key。",
      apiSettingsTitle: "浏览器 API",
      apiKey: "API Key",
      apiBaseUrl: "Responses URL / 中转地址",
      apiTextModel: "文本模型",
      apiImageModel: "图像模型",
      apiHeaders: "请求头 JSON",
      hint: "上传 1 张时按单图处理，上传多张时自动按多张图输入处理。",
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
      sourceUploadMultiple: "多张图上传",
      sourceUploadSingle: "单张图片上传",
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
    generateError: "Submission failed. Check the form and API configuration, then try again.",
    apiKeyRequired: "Enter a browser API key first.",
    apiSettingsTitle: "Browser API",
    apiKey: "API key",
    apiBaseUrl: "Responses URL / relay URL",
    apiTextModel: "Text model",
    apiImageModel: "Image model",
    apiHeaders: "Headers JSON",
    hint: "Upload one image for a single-image run, or upload multiple images for a multi-image input.",
    imageCounter: "{current}/{total}",
    imageTypes: "Image types",
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
    sourceUploadMultiple: "Multi-image upload",
    sourceUploadSingle: "Single-image upload",
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

function getDefaultMarketState() {
  return {
    country: INITIAL_PAYLOAD.country,
    language: INITIAL_PAYLOAD.language,
    platform: INITIAL_PAYLOAD.platform,
  };
}

export function CreateJobForm({ defaultImageModel, language }: { defaultImageModel: string; language: UiLanguage }) {
  const router = useRouter();
  const text = useMemo(() => copyFor(language), [language]);
  const maxImagesPerPrompt = useMemo(() => getMaxImagesPerPromptForModel(defaultImageModel), [defaultImageModel]);
  const suiteModeLabel = language === "zh" ? "套图模式" : "Image set mode";
  const amazonAPlusModeLabel = language === "zh" ? "亚马逊 A+" : "Amazon A+";
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
  const commerceProductNameLabel = language === "zh" ? "图片名（必填）" : "Image name (required)";
  const commerceSellingPointsLabel = language === "zh" ? "卖点（选填）" : "Selling points (optional)";
  const commerceMaterialInfoLabel = language === "zh" ? "材质（选填）" : "Material (optional)";
  const commerceSizeInfoLabel = language === "zh" ? "尺寸规格（选填）" : "Size / specs (optional)";
  const commerceBrandNameLabel = language === "zh" ? "品牌名（选填）" : "Brand name (optional)";
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
  const isStandardMode = payload.creationMode === "standard";
  const isSuiteMode = payload.creationMode === "suite";
  const isAmazonMode = payload.creationMode === "amazon-a-plus";
  const isPromptMode = payload.creationMode === "prompt";
  const isReferenceMode = payload.creationMode === "reference-remix";
  const isStructuredCommerceMode = isStandardMode || isSuiteMode || isAmazonMode;
  const activeModeClassName = CREATE_MODE_CLASS_NAMES[payload.creationMode];
  const activeModeProfile = useMemo(() => {
    const profiles: Record<
      CreationMode,
      {
        assetTitle: string;
        eyebrow: string;
        fieldTitle: string;
        marketTitle: string;
        quantityTitle: string;
        resolutionTitle: string;
        ratioTitle: string;
        title: string;
        typeTitle: string;
      }
    > =
      language === "zh"
        ? {
            standard: {
              assetTitle: "商品原图",
              eyebrow: "单品精修",
              fieldTitle: "单图信息",
              marketTitle: "投放市场",
              quantityTitle: "生成组数",
              resolutionTitle: "输出清晰度",
              ratioTitle: "构图比例",
              title: "标准模式工作台",
              typeTitle: "成图片型",
            },
            suite: {
              assetTitle: "套图主商品",
              eyebrow: "成套策划",
              fieldTitle: "套图企划",
              marketTitle: "套图市场",
              quantityTitle: "套图组数",
              resolutionTitle: "整套清晰度",
              ratioTitle: "套图比例",
              title: "套图模式工作台",
              typeTitle: "套图模块",
            },
            "amazon-a-plus": {
              assetTitle: "A+ 主商品",
              eyebrow: "Amazon 内容",
              fieldTitle: "A+ 模块策划",
              marketTitle: "Amazon 市场",
              quantityTitle: "模块组数",
              resolutionTitle: "模块清晰度",
              ratioTitle: "模块比例",
              title: "亚马逊 A+ 工作台",
              typeTitle: "A+ 模块",
            },
            prompt: {
              assetTitle: "参考素材",
              eyebrow: "文本直出",
              fieldTitle: "提示词编排",
              marketTitle: "提示词市场",
              quantityTitle: "提示词数量",
              resolutionTitle: "输出清晰度",
              ratioTitle: "画面比例",
              title: "提示词模式工作台",
              typeTitle: "提示词任务",
            },
            "reference-remix": {
              assetTitle: "产品原图",
              eyebrow: "结构复刻",
              fieldTitle: "复刻控制台",
              marketTitle: "复刻素材",
              quantityTitle: "复刻张数",
              resolutionTitle: "复刻清晰度",
              ratioTitle: "复刻比例",
              title: "参考图复刻工作台",
              typeTitle: "复刻目标",
            },
          }
        : {
            standard: {
              assetTitle: "Product source",
              eyebrow: "Single product",
              fieldTitle: "Image brief",
              marketTitle: "Market",
              quantityTitle: "Output sets",
              resolutionTitle: "Output clarity",
              ratioTitle: "Composition",
              title: "Standard workbench",
              typeTitle: "Image types",
            },
            suite: {
              assetTitle: "Suite hero product",
              eyebrow: "Set planning",
              fieldTitle: "Suite brief",
              marketTitle: "Suite market",
              quantityTitle: "Set groups",
              resolutionTitle: "Suite clarity",
              ratioTitle: "Suite ratio",
              title: "Image set workbench",
              typeTitle: "Suite modules",
            },
            "amazon-a-plus": {
              assetTitle: "A+ hero product",
              eyebrow: "Amazon content",
              fieldTitle: "A+ module brief",
              marketTitle: "Amazon market",
              quantityTitle: "Module groups",
              resolutionTitle: "Module clarity",
              ratioTitle: "Module ratio",
              title: "Amazon A+ workbench",
              typeTitle: "A+ modules",
            },
            prompt: {
              assetTitle: "Reference assets",
              eyebrow: "Text first",
              fieldTitle: "Prompt board",
              marketTitle: "Prompt market",
              quantityTitle: "Prompt count",
              resolutionTitle: "Output clarity",
              ratioTitle: "Frame ratio",
              title: "Prompt workbench",
              typeTitle: "Prompt tasks",
            },
            "reference-remix": {
              assetTitle: "Product source",
              eyebrow: "Structure remake",
              fieldTitle: "Remake console",
              marketTitle: "Remake assets",
              quantityTitle: "Remake outputs",
              resolutionTitle: "Remake clarity",
              ratioTitle: "Remake ratio",
              title: "Reference remake workbench",
              typeTitle: "Remake goal",
            },
          };

    return profiles[payload.creationMode];
  }, [language, payload.creationMode]);
  const structuredFieldLabels = isSuiteMode
    ? {
        brandName: language === "zh" ? "系列品牌（选填）" : "Series brand (optional)",
        materialInfo: language === "zh" ? "材质体系（选填）" : "Material system (optional)",
        productName: language === "zh" ? "套图名（必填）" : "Set name (required)",
        sellingPoints: language === "zh" ? "套图卖点（选填）" : "Set selling points (optional)",
        sizeInfo: language === "zh" ? "规格结构（选填）" : "Spec structure (optional)",
      }
    : isAmazonMode
      ? {
          brandName: language === "zh" ? "品牌 / 店铺（选填）" : "Brand / store (optional)",
          materialInfo: language === "zh" ? "产品证据（选填）" : "Product proof (optional)",
          productName: language === "zh" ? "A+ 模块名（必填）" : "A+ module name (required)",
          sellingPoints: language === "zh" ? "核心转化信息（选填）" : "Conversion message (optional)",
          sizeInfo: language === "zh" ? "参数与对比（选填）" : "Specs and comparison (optional)",
        }
      : {
          brandName: commerceBrandNameLabel,
          materialInfo: commerceMaterialInfoLabel,
          productName: commerceProductNameLabel,
          sellingPoints: commerceSellingPointsLabel,
          sizeInfo: commerceSizeInfoLabel,
        };
  const [variantsInput, setVariantsInput] = useState(String(INITIAL_PAYLOAD.variantsPerType));
  const [draftReady, setDraftReady] = useState(false);
  const [agentDraftId, setAgentDraftId] = useState(() => createCreateDraftId());
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [submitBlockedFeedback, setSubmitBlockedFeedback] = useState(false);
  const [isSourceDropActive, setIsSourceDropActive] = useState(false);
  const [isReferenceDropActive, setIsReferenceDropActive] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceDropDepthRef = useRef(0);
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceDropDepthRef = useRef(0);
  const productNameInputRef = useRef<HTMLInputElement | null>(null);
  const promptInputRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
  const variantsInputRef = useRef<HTMLInputElement | null>(null);
  const submitBlockedTimerRef = useRef<number | null>(null);
  const [viewportLayout, setViewportLayout] = useState({
    compact: false,
    cramped: false,
    availableHeight: 0,
  });
  const [activeWorkbenchArea, setActiveWorkbenchArea] = useState<WorkbenchAreaKey>("assets");

  const effectiveGenerationSemantics = inferGenerationSemanticsFromSourceCount(files.length);
  const currentReferenceImageCount = payload.creationMode === "reference-remix" ? referenceFiles.length : 0;
  const isSingleSourceMode =
    payload.creationMode === "suite" || payload.creationMode === "amazon-a-plus" || payload.creationMode === "reference-remix";
  const isSingleReferenceMode = payload.creationMode === "reference-remix";
  const maxReferenceImagesForSelection = isSingleReferenceMode ? 1 : 0;
  const currentRequestImageCount = useMemo(
    () =>
      getRequestImageCount({
        creationMode: payload.creationMode,
        generationSemantics: effectiveGenerationSemantics,
        sourceImageCount: files.length,
        referenceImageCount: currentReferenceImageCount,
      }),
    [effectiveGenerationSemantics, currentReferenceImageCount, files.length, payload.creationMode],
  );

  function buildSourceLimitMessage(limit: number) {
    return language === "zh" ? `当前最多支持上传 ${limit} 张原图。` : `You can upload up to ${limit} source images.`;
  }

  function buildReferenceLimitMessage(limit: number) {
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

    if (isStructuredCommerceMode && !payload.productName.trim()) {
      return "product-name";
    }

    return null;
  }, [
    files.length,
    isPending,
    currentRequestImageCount,
    isStructuredCommerceMode,
    maxImagesPerPrompt,
    payload.creationMode,
    payload.productName,
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
        setAgentDraftId(createCreateDraftId());
        setDraftReady(true);
        return;
      }

      const draft = JSON.parse(rawDraft) as {
        draftId?: string;
        payload?: (typeof INITIAL_PAYLOAD) & { customPrompt?: string; customNegativePrompt?: string; promptInputs?: string[] };
        selectedTypes?: string[];
        selectedRatios?: string[];
        selectedResolutions?: string[];
        autoLanguageByCountry?: boolean;
        promptMarketOverridesEnabled?: boolean;
        recommendationMessage?: string;
      };
      setAgentDraftId(readCreateDraftIdFromDraftJson(rawDraft) ?? createCreateDraftId());

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
          strategyWorkflowMode: "quick",
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
      setAgentDraftId(createCreateDraftId());
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
        draftId: agentDraftId,
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
    agentDraftId,
    promptMarketOverridesEnabled,
    draftReady,
    payload,
    recommendationMessage,
    selectedRatios,
    selectedResolutions,
    selectedTypes,
  ]);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    window.dispatchEvent(new CustomEvent(CREATE_AGENT_DRAFT_CONTEXT_EVENT, { detail: { draftId: agentDraftId } }));
  }, [agentDraftId, draftReady]);

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

    const defaults = getDefaultMarketState();
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
  }, [payload.country, payload.creationMode, payload.language, payload.platform]);

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
    const sourceLimit = isSingleSourceMode ? 1 : AUTO_SOURCE_IMAGE_LIMIT;
    const limitedFiles = nextFiles.slice(0, sourceLimit);
    if (limitedFiles.length < nextFiles.length) {
      setErrorMessage(buildSourceLimitMessage(sourceLimit));
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

  async function submitCreateJob() {
    const submitVariantsPerType = payload.creationMode === "prompt" ? 1 : parsedVariantsPerType;
    if (submitVariantsPerType === null) {
      triggerSubmitBlockedFeedback("variants");
      return;
    }

    const browserApiSettings = readBrowserApiSettings();
    if (!browserApiSettings.apiKey.trim()) {
      setErrorMessage(text.apiKeyRequired);
      return;
    }

    const submitSelectedResolutions = [normalizeSelectedResolutions(selectedResolutions)[0]];
    let referenceLayoutOverride: unknown = null;
    let referencePosterCopyOverride: unknown = null;
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
        generationSemantics: effectiveGenerationSemantics,
        sku: "",
        promptInputs: payload.creationMode === "prompt" ? normalizedPromptInputs : undefined,
        customNegativePrompt: payload.creationMode === "prompt" ? undefined : (payload as { customNegativePrompt?: string }).customNegativePrompt,
        variantsPerType: submitVariantsPerType,
        selectedTypes: effectiveSelectedTypes,
        selectedRatios,
        selectedResolutions: submitSelectedResolutions,
        marketingStrategy: undefined,
        imageStrategies: undefined,
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
        uiLanguage: language,
        temporaryProvider: {
          provider: browserApiSettings.provider,
          apiKey: browserApiSettings.apiKey,
          apiBaseUrl: browserApiSettings.apiBaseUrl,
          apiHeaders: browserApiSettings.apiHeaders,
          textModel: browserApiSettings.textModel,
          imageModel: browserApiSettings.imageModel,
        },
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
      throw new Error(parsedBody?.error || rawText || text.generateError);
    }

    const body = (await response.json()) as { jobId: string };
    window.localStorage.removeItem(CREATE_JOB_DRAFT_KEY);
    setSubmittedJobId(body.jobId);
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
    setAgentDraftId(createCreateDraftId());
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
      setActiveWorkbenchArea("assets");
      window.setTimeout(() => {
        sourceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        sourceFileInputRef.current?.focus();
      }, 0);
      return;
    }

    if (reason === "reference") {
      setActiveWorkbenchArea("assets");
      window.setTimeout(() => {
        referenceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        referenceFileInputRef.current?.focus();
      }, 0);
      return;
    }

    if (reason === "suite-source-limit" || reason === "amazon-a-plus-source-limit" || reason === "reference-source-limit") {
      setActiveWorkbenchArea("assets");
      window.setTimeout(() => {
        sourceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        sourceFileInputRef.current?.focus();
      }, 0);
      return;
    }

    if (reason === "reference-reference-limit") {
      setActiveWorkbenchArea("assets");
      window.setTimeout(() => {
        referenceFileInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        referenceFileInputRef.current?.focus();
      }, 0);
      return;
    }

    if (reason === "variants") {
      setActiveWorkbenchArea("submit");
      window.setTimeout(() => {
        variantsInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        variantsInputRef.current?.focus();
        variantsInputRef.current?.select();
      }, 0);
      return;
    }

    setActiveWorkbenchArea("brief");
    window.setTimeout(() => {
      if (reason === "prompt") {
        promptInputRefs.current[0]?.focus();
        promptInputRefs.current[0]?.select();
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

    startTransition(async () => {
      try {
        await submitCreateJob();
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

    router.push(`/jobs/${submittedJobId}`);
  }

  const currentPreviewUrl = previewUrls[previewIndex] ?? null;
  const currentReferencePreviewUrl = referencePreviewUrls[referencePreviewIndex] ?? null;
  const resolutionOptions = RESOLUTIONS;
  const hasStructuredSizeInfo = Boolean(payload.sizeInfo.trim());
  const effectiveSelectedTypes =
    payload.creationMode === "prompt" || payload.creationMode === "reference-remix"
      ? ["scene"]
      : [
          ...selectedTypes.filter((type) => hasStructuredSizeInfo || type !== "size-spec"),
          ...(hasStructuredSizeInfo && !selectedTypes.includes("size-spec") ? ["size-spec"] : []),
        ];
  const effectiveTypeCount = effectiveSelectedTypes.length;
  const sourceUploadModeLabel = files.length > 1 ? text.sourceUploadMultiple : text.sourceUploadSingle;
  const joinSummaryParts = (parts: Array<string | null | undefined>) =>
    parts
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(" / ");
  const marketSummary =
    payload.creationMode === "reference-remix"
      ? joinSummaryParts([sourceUploadModeLabel, selectedRatios[0], selectedResolutions[0], parsedVariantsPerType === null ? text.quantityPending : `${parsedVariantsPerType}`])
      : payload.creationMode === "prompt"
        ? joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.platform ? labelFor(payload.platform, language, PLATFORMS) : "",
          payload.language ? labelFor(payload.language, language, OUTPUT_LANGUAGES) : "",
          text.promptMode,
          files.length ? sourceUploadModeLabel : "",
          selectedRatios[0],
          selectedResolutions[0],
        ])
      : payload.creationMode === "suite"
        ? joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.language ? labelFor(payload.language, language, OUTPUT_LANGUAGES) : "",
          payload.platform ? labelFor(payload.platform, language, PLATFORMS) : "",
          suiteModeLabel,
          sourceUploadModeLabel,
          effectiveTypeCount ? `${effectiveTypeCount} ${text.typesUnit}` : "",
          selectedRatios[0],
          selectedResolutions[0],
        ])
      : payload.creationMode === "amazon-a-plus"
        ? joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.language ? labelFor(payload.language, language, OUTPUT_LANGUAGES) : "",
          amazonAPlusModeLabel,
          sourceUploadModeLabel,
          effectiveTypeCount ? `${effectiveTypeCount} ${text.typesUnit}` : "",
          selectedRatios[0],
          selectedResolutions[0],
          ])
      : joinSummaryParts([
          payload.country ? labelFor(payload.country, language, COUNTRIES) : "",
          payload.platform ? labelFor(payload.platform, language, PLATFORMS) : "",
          text.standardMode,
          sourceUploadModeLabel,
          effectiveTypeCount ? `${effectiveTypeCount} ${text.typesUnit}` : "",
          selectedRatios[0],
          selectedResolutions[0],
        ]);
  const requestInputCount = getRequestInputGroupCount({
    creationMode: payload.creationMode,
    generationSemantics: effectiveGenerationSemantics,
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
      : requestInputCount * effectiveTypeCount * parsedVariantsPerType;
  const requestCountValue = requestCount === null ? "--" : String(requestCount);
  const selectedRatioDirection = language === "zh" ? "单选" : "Single select";
  const actualGenerationLabel = language === "zh" ? "实际生成数量" : "Actual outputs";
  const submitButtonLabel = text.submit;
  const requestInputLabel =
    payload.creationMode === "prompt"
      ? files.length === 0
        ? language === "zh"
          ? "文生图输入"
          : "text-to-image input"
        : files.length > 1
          ? language === "zh"
            ? "多张图输入"
            : "multi-image input"
          : language === "zh"
            ? "单张参考图"
            : "single reference image"
      : effectiveGenerationSemantics === "joint"
        ? language === "zh"
          ? `${requestInputCount} 个多张图输入组`
          : `${requestInputCount} multi-image input group`
        : language === "zh"
          ? `${requestInputCount} 张原图`
          : `${requestInputCount} source image`;
  const bannerInputMetricLabel =
    language === "zh"
      ? isPromptMode
        ? "提示词"
        : isReferenceMode
          ? "复刻输入"
          : "输入组"
      : isPromptMode
        ? "Prompts"
        : isReferenceMode
          ? "Remake input"
          : "Input groups";
  const formulaDisplay =
    payload.creationMode === "prompt"
      ? language === "zh"
        ? `${requestInputLabel} × ${normalizedPromptInputs.length} 条提示词 × ${selectedRatios.length} 个比例 × ${selectedResolutions.length} 个分辨率`
        : `${requestInputLabel} x ${normalizedPromptInputs.length} prompt x ${selectedRatios.length} ratio x ${selectedResolutions.length} resolution`
      : language === "zh"
        ? `${requestInputLabel} × ${effectiveTypeCount} 个类型 × ${parsedVariantsPerType ?? "-"} 组`
        : `${requestInputLabel} x ${effectiveTypeCount} type x ${parsedVariantsPerType ?? "-"} groups`;
  useEffect(() => {
    function handleCreateAgentMap(event: Event) {
      const mapped = (event as CustomEvent<CreateAgentMapDetail>).detail;
      if (!mapped || typeof mapped !== "object") {
        return;
      }

      const mappedPromptInputs =
        mapped.agentType === "prompt-engineer" && Array.isArray(mapped.promptSuggestions) && mapped.promptSuggestions.length > 0
          ? resolveMappedPromptInputs({
              promptSuggestions: mapped.promptSuggestions,
              targetPromptCount: requestCount,
            })
          : null;
      const mappedFields = mapped.fields ?? {};

      if (mappedPromptInputs) {
        setPromptMarketOverridesEnabled(false);
      }

      setPayload((current) => ({
        ...current,
        productName: mappedFields.productName ?? current.productName,
        sellingPoints: mappedFields.sellingPoints ?? current.sellingPoints,
        materialInfo: mappedFields.materialInfo ?? current.materialInfo,
        sizeInfo: mappedFields.sizeInfo ?? current.sizeInfo,
        brandName: mappedFields.brandName ?? current.brandName,
        creationMode: mappedPromptInputs ? "prompt" : current.creationMode,
        strategyWorkflowMode: mappedPromptInputs ? "quick" : current.strategyWorkflowMode,
        platform: mappedPromptInputs ? INITIAL_PAYLOAD.platform : current.platform,
        promptInputs: mappedPromptInputs ?? current.promptInputs,
      }));
    }

    window.addEventListener(CREATE_FORM_MAPPING_EVENT, handleCreateAgentMap as EventListener);
    return () => {
      window.removeEventListener(CREATE_FORM_MAPPING_EVENT, handleCreateAgentMap as EventListener);
    };
  }, [requestCount]);
  const currentPlatformLabel =
    payload.creationMode === "amazon-a-plus" ? "Amazon" : labelFor(payload.platform, language, PLATFORMS);
  const modeSignalValue = isReferenceMode
    ? `${files.length}+${referenceFiles.length}`
    : isPromptMode
      ? String(normalizedPromptInputs.length)
      : currentPlatformLabel || "--";
  const selectedResolutionLabel = labelFor(selectedResolutions[0] ?? "1K", language, RESOLUTIONS);
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
  const selectedResolutionDetail = resolutionDetailMap[selectedResolutions[0] ?? "1K"] ?? "";
  const createWorkspaceClassName = [
    "create-workspace",
    activeModeClassName,
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
  function activateReferenceRemixMode() {
    setActiveWorkbenchArea("assets");
    setPromptMarketOverridesEnabled(false);
    setSelectedTypes(["scene"]);
    setSelectedRatios(["1:1"]);
    setSelectedResolutions(["1K"]);
    setVariantsInput("1");
    setPayload((current) => ({
      ...current,
      creationMode: "reference-remix",
      strategyWorkflowMode: "quick",
      country: "",
      language: "",
      platform: "",
      includeCopyLayout: false,
      referenceLayoutOverrideJson: "",
      referencePosterCopyOverrideJson: "",
      variantsPerType: 1,
    }));
  }

  function activateStructuredMode(nextMode: "standard" | "suite" | "amazon-a-plus") {
    setActiveWorkbenchArea("assets");
    const nextSelectedTypes =
      nextMode === "suite"
        ? SUITE_SELECTED_TYPES
        : nextMode === "amazon-a-plus"
          ? AMAZON_A_PLUS_SELECTED_TYPES
          : INITIAL_SELECTED_TYPES;

    setSelectedTypes(nextSelectedTypes);
    setSelectedRatios([selectedRatios[0] ?? "1:1"]);
    setSelectedResolutions([normalizeSelectedResolutions(selectedResolutions)[0]]);
    setPayload((current) => ({
      ...current,
      creationMode: nextMode,
      strategyWorkflowMode: "quick",
      platform: nextMode === "amazon-a-plus" ? "amazon" : current.platform || INITIAL_PAYLOAD.platform,
    }));
  }

  const creationModeSelector = (
    <div
      aria-label={language === "zh" ? "模式选择" : "Mode selection"}
      className="create-header-mode-fieldset"
      role="radiogroup"
    >
      <div className="creation-mode-grid">
        <label className={payload.creationMode === "standard" ? "create-mode-option is-standard is-active" : "create-mode-option is-standard"}>
          <input
            checked={payload.creationMode === "standard"}
            name="creation-mode"
            onChange={() => activateStructuredMode("standard")}
            type="radio"
          />
          <span className="create-mode-option-index">01</span>
          <strong>{text.standardMode}</strong>
        </label>
        <label className={payload.creationMode === "suite" ? "create-mode-option is-suite is-active" : "create-mode-option is-suite"}>
          <input
            checked={payload.creationMode === "suite"}
            name="creation-mode"
            onChange={() => activateStructuredMode("suite")}
            type="radio"
          />
          <span className="create-mode-option-index">02</span>
          <strong>{suiteModeLabel}</strong>
        </label>
        <label className={payload.creationMode === "amazon-a-plus" ? "create-mode-option is-amazon is-active" : "create-mode-option is-amazon"}>
          <input
            checked={payload.creationMode === "amazon-a-plus"}
            name="creation-mode"
            onChange={() => activateStructuredMode("amazon-a-plus")}
            type="radio"
          />
          <span className="create-mode-option-index">03</span>
          <strong>{amazonAPlusModeLabel}</strong>
        </label>
        <label className={payload.creationMode === "prompt" ? "create-mode-option is-prompt is-active" : "create-mode-option is-prompt"}>
          <input
            checked={payload.creationMode === "prompt"}
            name="creation-mode"
            onChange={() => {
              setActiveWorkbenchArea("brief");
              setPromptMarketOverridesEnabled(false);
              setPayload((current) => ({
                ...current,
                creationMode: "prompt",
                strategyWorkflowMode: "quick",
                platform: INITIAL_PAYLOAD.platform,
              }));
            }}
            type="radio"
          />
          <span className="create-mode-option-index">04</span>
          <strong>{text.promptMode}</strong>
        </label>
        <label className={payload.creationMode === "reference-remix" ? "create-mode-option is-reference is-active" : "create-mode-option is-reference"}>
          <input
            checked={payload.creationMode === "reference-remix"}
            name="creation-mode"
            onChange={activateReferenceRemixMode}
            type="radio"
          />
          <span className="create-mode-option-index">05</span>
          <strong>{text.referenceMode}</strong>
        </label>
      </div>
    </div>
  );
  return (
    <>
      <form className={createWorkspaceClassName} onSubmit={handleSubmit} ref={formRef} style={createWorkspaceStyle}>
        <section className="create-workbench-banner" aria-label={activeModeProfile.title}>
          <div className="create-workbench-title">
            <span className="create-workbench-kicker">{activeModeProfile.eyebrow}</span>
            <h1>{activeModeProfile.title}</h1>
          </div>
          <div className="create-workbench-metrics" aria-label={language === "zh" ? "当前任务参数" : "Current task settings"}>
            <span>
              <em>{bannerInputMetricLabel}</em>
              <strong>{requestInputCount}</strong>
            </span>
            <span>
              <em>{activeModeProfile.resolutionTitle}</em>
              <strong>{selectedResolutionLabel}</strong>
            </span>
            <span>
              <em>{language === "zh" ? "预计输出" : "Planned outputs"}</em>
              <strong>{requestCountValue}</strong>
            </span>
            <span>
              <em>{activeModeProfile.marketTitle}</em>
              <strong>{modeSignalValue}</strong>
            </span>
          </div>
          {creationModeSelector}
        </section>
        <section className="create-area-dock" aria-label={language === "zh" ? "创作台主要区" : "Workbench main areas"}>
          <div className="create-area-panels">
            <section
              aria-label={language === "zh" ? "素材区" : "Assets"}
              className={activeWorkbenchArea === "assets" ? "create-area-panel is-active" : "create-area-panel"}
              id="create-area-panel-assets"
            >
              <div className="create-area-panel-stage is-assets">
                <section className="panel create-panel create-source-panel">
                  <div className="split-header compact">
                    <div>
                      <h2>{activeModeProfile.assetTitle}</h2>
                    </div>
                    <div className="create-panel-actions">
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
                      <div className="preview-stage-empty-content" />
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
                        <div className="preview-stage-empty-content" />
                      </div>
                    )}
                  </section>
                ) : null}
              </div>
            </section>

            <section
              aria-label={language === "zh" ? "内容区" : "Brief"}
              className={activeWorkbenchArea === "brief" ? "create-area-panel is-active" : "create-area-panel"}
              id="create-area-panel-brief"
            >
              <div className="create-area-panel-stage is-brief">
                <section className="panel create-panel create-base-panel">
                  <div className="create-mode-panel-heading">
                    <span className="create-workbench-kicker">{activeModeProfile.eyebrow}</span>
                    <h2>{activeModeProfile.fieldTitle}</h2>
                  </div>
                  <div className={payload.creationMode === "reference-remix" ? "create-base-grid is-remix-layout" : "create-base-grid"}>
                    <div className="create-base-fields">
                {isPromptMode ? (
                  <div className="create-mode-fields create-prompt-fields">
                    {payload.promptInputs.map((promptInput, promptIndex) => (
                      <label className="create-field create-prompt-field" key={`prompt-input-${promptIndex}`}>
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
                    <div className="create-prompt-actions">
                      <button className="ghost-button" onClick={addPromptInput} type="button">
                        {text.addPromptInput}
                      </button>
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
                    </div>
                  </div>
                ) : null}

                {isStandardMode ? (
                  <div className="create-mode-fields create-standard-fields">
                    <label className="create-field create-field-title">
                      <span>{structuredFieldLabels.productName}</span>
                      <input
                        ref={productNameInputRef}
                        value={payload.productName}
                        onChange={(event) => setPayload({ ...payload, productName: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-long">
                      <span>{structuredFieldLabels.sellingPoints}</span>
                      <textarea
                        rows={longRows}
                        value={payload.sellingPoints}
                        onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })}
                      />
                    </label>
                    <label className="create-field">
                      <span>{structuredFieldLabels.materialInfo}</span>
                      <textarea
                        rows={mediumRows}
                        value={payload.materialInfo}
                        onChange={(event) => setPayload({ ...payload, materialInfo: event.target.value })}
                      />
                    </label>
                    <label className="create-field">
                      <span>{structuredFieldLabels.sizeInfo}</span>
                      <textarea
                        rows={mediumRows}
                        value={payload.sizeInfo}
                        onChange={(event) => setPayload({ ...payload, sizeInfo: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-brand">
                      <span>{structuredFieldLabels.brandName}</span>
                      <input
                        list="brand-library-options"
                        value={payload.brandName}
                        onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}

                {isSuiteMode ? (
                  <div className="create-mode-fields create-suite-fields">
                    <label className="create-field create-field-title">
                      <span>{structuredFieldLabels.productName}</span>
                      <input
                        ref={productNameInputRef}
                        value={payload.productName}
                        onChange={(event) => setPayload({ ...payload, productName: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-brand">
                      <span>{structuredFieldLabels.brandName}</span>
                      <input
                        list="brand-library-options"
                        value={payload.brandName}
                        onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-long">
                      <span>{structuredFieldLabels.sellingPoints}</span>
                      <textarea
                        rows={longRows}
                        value={payload.sellingPoints}
                        onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })}
                      />
                    </label>
                    <label className="create-field">
                      <span>{structuredFieldLabels.materialInfo}</span>
                      <textarea
                        rows={mediumRows}
                        value={payload.materialInfo}
                        onChange={(event) => setPayload({ ...payload, materialInfo: event.target.value })}
                      />
                    </label>
                    <label className="create-field">
                      <span>{structuredFieldLabels.sizeInfo}</span>
                      <textarea
                        rows={mediumRows}
                        value={payload.sizeInfo}
                        onChange={(event) => setPayload({ ...payload, sizeInfo: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}

                {isAmazonMode ? (
                  <div className="create-mode-fields create-amazon-fields">
                    <label className="create-field create-field-title">
                      <span>{structuredFieldLabels.productName}</span>
                      <input
                        ref={productNameInputRef}
                        value={payload.productName}
                        onChange={(event) => setPayload({ ...payload, productName: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-long">
                      <span>{structuredFieldLabels.sellingPoints}</span>
                      <textarea
                        rows={longRows}
                        value={payload.sellingPoints}
                        onChange={(event) => setPayload({ ...payload, sellingPoints: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-proof">
                      <span>{structuredFieldLabels.materialInfo}</span>
                      <textarea
                        rows={mediumRows}
                        value={payload.materialInfo}
                        onChange={(event) => setPayload({ ...payload, materialInfo: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-compare">
                      <span>{structuredFieldLabels.sizeInfo}</span>
                      <textarea
                        rows={mediumRows}
                        value={payload.sizeInfo}
                        onChange={(event) => setPayload({ ...payload, sizeInfo: event.target.value })}
                      />
                    </label>
                    <label className="create-field create-field-brand">
                      <span>{structuredFieldLabels.brandName}</span>
                      <input
                        list="brand-library-options"
                        value={payload.brandName}
                        onChange={(event) => setPayload({ ...payload, brandName: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}

                {isReferenceMode ? (
                  <div className="create-mode-fields create-reference-fields">
                    <div className="create-reference-status-grid">
                      <span>
                        <em>{language === "zh" ? "原图" : "Source"}</em>
                        <strong>{files.length}</strong>
                      </span>
                      <span>
                        <em>{language === "zh" ? "参考图" : "Reference"}</em>
                        <strong>{referenceFiles.length}</strong>
                      </span>
                      <span>
                        <em>{activeModeProfile.ratioTitle}</em>
                        <strong>{selectedRatios[0] ?? "1:1"}</strong>
                      </span>
                      <span>
                        <em>{activeModeProfile.resolutionTitle}</em>
                        <strong>{selectedResolutionLabel}</strong>
                      </span>
                    </div>
                  </div>
                ) : null}

                <datalist id="brand-library-options">
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.name} />
                  ))}
                </datalist>
                    </div>
                  </div>
                </section>

                {payload.creationMode !== "prompt" && payload.creationMode !== "reference-remix" ? (
                  <section className="panel create-panel create-mode-panel create-market-panel">
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
            </section>

            <section
              aria-label={language === "zh" ? "参数区" : "Settings"}
              className={activeWorkbenchArea === "settings" ? "create-area-panel is-active" : "create-area-panel"}
              id="create-area-panel-settings"
            >
              <div className="create-area-panel-stage is-settings">
                <section className="panel create-panel create-base-panel create-output-panel">
                  <div className="create-mode-panel-heading">
                    <span className="create-workbench-kicker">{activeModeProfile.eyebrow}</span>
                    <h2>{language === "zh" ? "输出参数" : "Output settings"}</h2>
                  </div>
                  <aside className={`create-base-side ${activeModeClassName}`}>
                    <div className="create-base-side-stack">
                      {isStructuredCommerceMode ? (
                        <fieldset className="create-generation-fieldset create-generation-fieldset-types">
                          <legend>
                            <span>{activeModeProfile.typeTitle}</span>
                            <span className="create-generation-legend-note">({text.typesUnit})</span>
                          </legend>
                          <div className="chip-grid small">
                            {IMAGE_TYPE_OPTIONS.map((option) => {
                              const isDisabled = option.value === "size-spec" && !hasStructuredSizeInfo;
                              const isAutoSizeType = option.value === "size-spec" && hasStructuredSizeInfo;
                              const isChecked = isAutoSizeType ? true : selectedTypes.includes(option.value);
                              return (
                                <label
                                  className={isChecked ? "chip is-active" : "chip"}
                                  key={option.value}
                                  title={option.description?.[language]}
                                >
                                  <input
                                    checked={isChecked}
                                    disabled={isDisabled || isAutoSizeType}
                                    onChange={() => toggleSelection(option.value, selectedTypes, setSelectedTypes)}
                                    type="checkbox"
                                  />
                                  <span>{option.label[language]}</span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      ) : null}
                      <fieldset className="create-generation-fieldset create-generation-fieldset-ratios">
                        <legend>
                          <span>{activeModeProfile.ratioTitle}</span>
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
                          <span>{activeModeProfile.resolutionTitle}</span>
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
                  </aside>
                </section>
              </div>
            </section>

            <section
              aria-label={language === "zh" ? "生成区" : "Generate"}
              className={activeWorkbenchArea === "submit" ? "create-area-panel is-active" : "create-area-panel"}
              id="create-area-panel-submit"
            >
              <div className="create-area-panel-stage is-submit">
                <section className="panel create-panel create-submit-panel">
                  <div className="create-mode-panel-heading">
                    <span className="create-workbench-kicker">{activeModeProfile.eyebrow}</span>
                    <h2>{language === "zh" ? "生成确认" : "Generation checkout"}</h2>
                  </div>
                  <div className={payload.creationMode === "reference-remix" ? "create-quantity-submit-group create-quantity-submit-group-inline is-remix-mode" : "create-quantity-submit-group create-quantity-submit-group-inline"}>
                  {payload.creationMode !== "reference-remix" && payload.creationMode !== "prompt" ? (
                    <label className="create-quantity-field create-quantity-card">
                      <span>{activeModeProfile.quantityTitle}</span>
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
                      {isPending ? text.submitting : submitButtonLabel}
                    </button>
                  </div>
                </div>
                </section>
              </div>
            </section>
          </div>
        </section>
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





