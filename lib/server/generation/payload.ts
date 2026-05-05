import "server-only";

import {
  AUTO_SOURCE_IMAGE_LIMIT,
  getPlannedRequestCount,
  getRequestImageCount,
  normalizeGenerationSemantics,
} from "@/lib/generation-semantics";
import { getMaxImagesPerPromptForModel } from "@/lib/image-model-limits";
import type { CreatePayload } from "@/lib/job-builder";
import type { ProviderOverride } from "@/lib/types";

const LEGACY_HALF_K_RESOLUTIONS = new Set(["0.5K", "512px"]);
const LEGACY_HALF_K_REJECTION_MESSAGE = "0.5K 分辨率已下线，请改用 1K、2K 或 4K。";

export class GenerationRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GenerationRequestError";
    this.status = status;
  }
}

export function isCreatePayload(value: unknown): value is CreatePayload {
  return Boolean(value && typeof value === "object");
}

export function parseCreatePayload(payloadRaw: FormDataEntryValue | null): CreatePayload {
  if (!payloadRaw || typeof payloadRaw !== "string") {
    throw new GenerationRequestError("Missing payload.");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    throw new GenerationRequestError("Invalid payload.");
  }

  if (!isCreatePayload(payload)) {
    throw new GenerationRequestError("Invalid payload.");
  }

  return payload;
}

function normalizePromptInputs(payload: CreatePayload): string[] {
  const explicitPromptInputs = Array.isArray((payload as { promptInputs?: unknown }).promptInputs)
    ? ((payload as { promptInputs?: unknown }).promptInputs as unknown[])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];

  if (explicitPromptInputs.length > 0) {
    return explicitPromptInputs;
  }

  const fallback = payload.customPrompt?.trim() || "";
  return fallback ? [fallback] : [];
}

function isMarketingStrategyMode(creationMode: CreatePayload["creationMode"]) {
  return creationMode === "standard" || creationMode === "suite" || creationMode === "amazon-a-plus";
}

function normalizeStructuredSelectedTypes(payload: CreatePayload) {
  const normalized = Array.isArray(payload.selectedTypes)
    ? payload.selectedTypes.map((value) => value.trim()).filter(Boolean)
    : [];

  if (payload.sizeInfo?.trim() && !normalized.includes("size-spec")) {
    normalized.push("size-spec");
  }

  return normalized;
}

export function normalizeCreatePayload(payload: CreatePayload): CreatePayload {
  const generationSemantics = normalizeGenerationSemantics(payload.generationSemantics);
  const strategyWorkflowMode = payload.strategyWorkflowMode ?? "quick";
  const normalizedStructuredFields = {
    productName: payload.productName?.trim() ?? "",
    brandName: payload.brandName?.trim() ?? "",
    sellingPoints: payload.sellingPoints?.trim() ?? "",
    materialInfo: payload.materialInfo?.trim() ?? "",
    sizeInfo: payload.sizeInfo?.trim() ?? "",
    category: "general",
    restrictions: "",
    sourceDescription: "",
  };

  if (payload.creationMode === "reference-remix") {
    return {
      ...payload,
      generationSemantics,
      sku: "",
      referenceRemakeGoal: "hard-remake",
      referenceStrength: "balanced",
      referenceCompositionLock: "balanced",
      referenceTextRegionPolicy: "preserve",
      referenceBackgroundMode: "preserve",
      preserveReferenceText: true,
      referenceCopyMode: "reference",
      productName: "",
      brandName: "",
      category: "",
      sellingPoints: "",
      restrictions: "",
      sourceDescription: "",
      materialInfo: "",
      sizeInfo: "",
      customNegativePrompt: "",
      referenceExtraPrompt: "",
      referenceNegativePrompt: "",
      country: "",
      language: "",
      platform: "",
      selectedTypes: ["scene"],
      selectedRatios: payload.selectedRatios?.length ? [payload.selectedRatios[0]] : ["1:1"],
      selectedResolutions: payload.selectedResolutions?.length ? [payload.selectedResolutions[0]] : ["1K"],
      selectedTemplateOverrides: {},
      includeCopyLayout: false,
      variantsPerType: Math.min(Math.max(payload.variantsPerType || 1, 1), 4),
    };
  }

  if (payload.creationMode === "suite") {
    return {
      ...payload,
      ...normalizedStructuredFields,
      generationSemantics,
      strategyWorkflowMode,
      selectedTypes: normalizeStructuredSelectedTypes(payload),
      selectedRatios: payload.selectedRatios?.length ? [payload.selectedRatios[0]] : ["1:1"],
      selectedResolutions: payload.selectedResolutions?.length ? [payload.selectedResolutions[0]] : ["1K"],
      includeCopyLayout: false,
      selectedTemplateOverrides: {},
      marketingStrategy: undefined,
      imageStrategies: undefined,
    };
  }

  if (payload.creationMode === "amazon-a-plus") {
    return {
      ...payload,
      ...normalizedStructuredFields,
      generationSemantics,
      strategyWorkflowMode,
      platform: "amazon",
      selectedTypes: normalizeStructuredSelectedTypes(payload),
      selectedRatios: payload.selectedRatios?.length ? [payload.selectedRatios[0]] : ["1:1"],
      selectedResolutions: payload.selectedResolutions?.length ? [payload.selectedResolutions[0]] : ["1K"],
      includeCopyLayout: false,
      selectedTemplateOverrides: {},
      marketingStrategy: undefined,
      imageStrategies: undefined,
    };
  }

  if (payload.creationMode === "standard") {
    return {
      ...payload,
      ...normalizedStructuredFields,
      strategyWorkflowMode,
      generationSemantics,
      selectedTypes: normalizeStructuredSelectedTypes(payload),
      selectedRatios: payload.selectedRatios?.length ? [payload.selectedRatios[0]] : ["1:1"],
      selectedResolutions: payload.selectedResolutions?.length ? [payload.selectedResolutions[0]] : ["1K"],
      marketingStrategy: undefined,
      imageStrategies: undefined,
    };
  }

  if (payload.creationMode === "prompt") {
    const promptInputs = normalizePromptInputs(payload);
    return {
      ...payload,
      generationSemantics: "joint",
      strategyWorkflowMode,
      sku: "",
      referenceRemakeGoal: "hard-remake",
      referenceStrength: "balanced",
      referenceCompositionLock: "balanced",
      referenceTextRegionPolicy: "preserve",
      referenceBackgroundMode: "preserve",
      preserveReferenceText: true,
      referenceCopyMode: "reference",
      productName: "",
      brandName: "",
      category: "",
      sellingPoints: "",
      restrictions: "",
      sourceDescription: "",
      materialInfo: "",
      sizeInfo: "",
      customNegativePrompt: "",
      referenceExtraPrompt: "",
      referenceNegativePrompt: "",
      selectedTypes: ["scene"],
      variantsPerType: 1,
      promptInputs,
      customPrompt: promptInputs[0] ?? payload.customPrompt ?? "",
    };
  }

  return {
    ...payload,
    strategyWorkflowMode,
    generationSemantics,
  };
}

export function validateCreatePayload(
  payload: CreatePayload,
  input: {
    imageModel: string;
    sourceFileCount: number;
    referenceFileCount: number;
  },
  options: {
    skipPlannedVariantsLimit?: boolean;
  } = {},
) {
  const creationMode = payload.creationMode ?? "standard";
  const generationSemantics = creationMode === "prompt" ? "joint" : normalizeGenerationSemantics(payload.generationSemantics);
  const selectedTypes = creationMode === "prompt" ? ["scene"] : payload.selectedTypes ?? [];
  const selectedRatios = payload.selectedRatios ?? [];
  const selectedResolutions = payload.selectedResolutions ?? [];
  const promptInputs = creationMode === "prompt" ? normalizePromptInputs(payload) : [];

  if (selectedResolutions.some((resolution) => LEGACY_HALF_K_RESOLUTIONS.has(resolution))) {
    throw new GenerationRequestError(LEGACY_HALF_K_REJECTION_MESSAGE);
  }

  if ((isMarketingStrategyMode(creationMode) && !payload.productName?.trim()) || selectedRatios.length === 0 || selectedResolutions.length === 0) {
    throw new GenerationRequestError("Please complete the required fields.");
  }

  if (!isMarketingStrategyMode(creationMode) && creationMode !== "prompt" && selectedTypes.length === 0) {
    throw new GenerationRequestError("Please complete the required fields.");
  }

  if (creationMode === "suite" && input.sourceFileCount !== 1) {
    throw new GenerationRequestError("Suite mode only supports 1 source image.");
  }

  if (creationMode === "suite" && input.referenceFileCount !== 0) {
    throw new GenerationRequestError("Suite mode does not support reference images.");
  }

  if (creationMode === "amazon-a-plus" && input.sourceFileCount !== 1) {
    throw new GenerationRequestError("Amazon A+ mode only supports 1 source image.");
  }

  if (creationMode === "amazon-a-plus" && input.referenceFileCount !== 0) {
    throw new GenerationRequestError("Amazon A+ mode does not support reference images.");
  }

  if (creationMode === "prompt" && promptInputs.length === 0) {
    throw new GenerationRequestError("Prompt mode requires at least one text prompt input.");
  }

  if ((creationMode === "standard" || creationMode === "prompt") && input.sourceFileCount > AUTO_SOURCE_IMAGE_LIMIT) {
    throw new GenerationRequestError(`Source upload supports up to ${AUTO_SOURCE_IMAGE_LIMIT} images.`);
  }

  if (creationMode !== "prompt" && input.sourceFileCount === 0) {
    throw new GenerationRequestError("Missing files.");
  }

  if (creationMode === "reference-remix" && input.sourceFileCount !== 1) {
    throw new GenerationRequestError("Reference remix mode requires exactly 1 source image.");
  }

  if (creationMode === "reference-remix" && input.referenceFileCount !== 1) {
    throw new GenerationRequestError("Reference remix mode requires exactly 1 reference image.");
  }

  const requestImageCount = getRequestImageCount({
    creationMode,
    generationSemantics,
    sourceImageCount: input.sourceFileCount,
    referenceImageCount: input.referenceFileCount,
  });
  const maxImagesPerPrompt = getMaxImagesPerPromptForModel(input.imageModel);
  if (requestImageCount > maxImagesPerPrompt) {
    throw new GenerationRequestError(
      creationMode === "reference-remix"
        ? `Reference remix mode only supports 1 source image + 1 reference image. The current image model supports up to ${maxImagesPerPrompt} total input images per request. Current selection would send ${requestImageCount}.`
        : creationMode === "suite" || creationMode === "amazon-a-plus"
          ? `The current image model supports up to ${maxImagesPerPrompt} input images per request. Current selection would send ${requestImageCount}.`
          : `The current image model supports up to ${maxImagesPerPrompt} input images per request. Current selection would send ${requestImageCount}.`,
    );
  }

  if (
    creationMode === "reference-remix" &&
    (!Number.isInteger(payload.variantsPerType) || payload.variantsPerType < 1 || payload.variantsPerType > 4)
  ) {
    throw new GenerationRequestError("Reference remix mode supports 1 to 4 variants.");
  }

  if (!Number.isInteger(payload.variantsPerType) || payload.variantsPerType < 1 || payload.variantsPerType > 10) {
    throw new GenerationRequestError("Quantity must be an integer between 1 and 10.");
  }

  const effectiveVariantsPerType = creationMode === "prompt" ? 1 : payload.variantsPerType;
  const effectiveRatioCount = isMarketingStrategyMode(creationMode) ? 1 : selectedRatios.length;
  const effectiveResolutionCount = isMarketingStrategyMode(creationMode) ? 1 : selectedResolutions.length;
  const basePlannedVariants = getPlannedRequestCount({
    creationMode,
    generationSemantics,
    sourceImageCount: input.sourceFileCount,
    typeCount: selectedTypes.length,
    ratioCount: effectiveRatioCount,
    resolutionCount: effectiveResolutionCount,
    variantsPerType: effectiveVariantsPerType,
  });
  const totalVariants =
    creationMode === "prompt" ? basePlannedVariants * Math.max(promptInputs.length, 1) : basePlannedVariants;

  if (!options.skipPlannedVariantsLimit && totalVariants > 96) {
    throw new GenerationRequestError("This batch is too large. Keep it under 96 generated variants per job.");
  }
}

export function sanitizeTemporaryProvider(
  temporaryProvider: ProviderOverride | undefined,
): ProviderOverride | undefined {
  if (
    temporaryProvider?.provider ||
    temporaryProvider?.apiKey ||
    temporaryProvider?.apiBaseUrl ||
    temporaryProvider?.apiHeaders ||
    temporaryProvider?.textModel ||
    temporaryProvider?.imageModel
  ) {
    return temporaryProvider;
  }

  return undefined;
}
