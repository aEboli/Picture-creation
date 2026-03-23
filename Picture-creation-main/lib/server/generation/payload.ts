import "server-only";

import {
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

export function normalizeCreatePayload(payload: CreatePayload): CreatePayload {
  const generationSemantics = normalizeGenerationSemantics(payload.generationSemantics);

  if (payload.creationMode === "reference-remix") {
    return {
      ...payload,
      generationSemantics,
      country: "",
      language: "",
      platform: "",
      selectedTypes: ["scene"],
      selectedRatios: payload.selectedRatios?.length ? [payload.selectedRatios[0]] : ["1:1"],
      selectedResolutions: payload.selectedResolutions?.length ? [payload.selectedResolutions[0]] : ["4K"],
      selectedTemplateOverrides: {},
      includeCopyLayout: false,
      variantsPerType: Math.min(Math.max(payload.variantsPerType || 1, 1), 4),
    };
  }

  if (payload.creationMode === "suite") {
    return {
      ...payload,
      generationSemantics,
      selectedTypes: ["main-image", "lifestyle", "feature-overview", "scene", "material-craft", "size-spec"],
      includeCopyLayout: false,
      selectedTemplateOverrides: {},
    };
  }

  if (payload.creationMode === "amazon-a-plus") {
    return {
      ...payload,
      generationSemantics,
      platform: "amazon",
      selectedTypes: ["poster", "feature-overview", "multi-scene", "detail", "size-spec", "culture-value"],
      includeCopyLayout: false,
      selectedTemplateOverrides: {},
    };
  }

  if (payload.creationMode === "prompt") {
    const promptInputs = normalizePromptInputs(payload);
    return {
      ...payload,
      generationSemantics: "joint",
      selectedTypes: ["scene"],
      variantsPerType: 1,
      promptInputs,
      customPrompt: promptInputs[0] ?? payload.customPrompt ?? "",
    };
  }

  return {
    ...payload,
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

  if (
    (creationMode === "standard" && !payload.productName?.trim()) ||
    selectedTypes.length === 0 ||
    selectedRatios.length === 0 ||
    selectedResolutions.length === 0
  ) {
    throw new GenerationRequestError("Please complete the required fields.");
  }

  if (
    creationMode === "suite" &&
    (
      !payload.category?.trim() ||
      !payload.sellingPoints?.trim() ||
      !payload.materialInfo?.trim() ||
      !payload.sizeInfo?.trim()
    )
  ) {
    throw new GenerationRequestError(
      "Image set mode requires category name, selling points, material, and size details.",
    );
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
  const basePlannedVariants = getPlannedRequestCount({
    creationMode,
    generationSemantics,
    sourceImageCount: input.sourceFileCount,
    typeCount: selectedTypes.length,
    ratioCount: selectedRatios.length,
    resolutionCount: selectedResolutions.length,
    variantsPerType: effectiveVariantsPerType,
  });
  const totalVariants =
    creationMode === "prompt" ? basePlannedVariants * Math.max(promptInputs.length, 1) : basePlannedVariants;

  if (totalVariants > 96) {
    throw new GenerationRequestError("This batch is too large. Keep it under 96 generated variants per job.");
  }
}

export function sanitizeTemporaryProvider(
  temporaryProvider: ProviderOverride | undefined,
): ProviderOverride | undefined {
  if (
    temporaryProvider?.apiKey ||
    temporaryProvider?.apiBaseUrl ||
    temporaryProvider?.apiVersion ||
    temporaryProvider?.apiHeaders
  ) {
    return temporaryProvider;
  }

  return undefined;
}
