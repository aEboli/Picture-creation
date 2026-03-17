import "server-only";

import {
  getPlannedRequestCount,
  getRequestImageCount,
  normalizeGenerationSemantics,
} from "@/lib/generation-semantics";
import { getMaxImagesPerPromptForModel } from "@/lib/image-model-limits";
import type { CreatePayload } from "@/lib/job-builder";
import type { ProviderOverride } from "@/lib/types";

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

function normalizeReferenceCopyMode(
  referenceCopyMode: CreatePayload["referenceCopyMode"],
): CreatePayload["referenceCopyMode"] {
  return referenceCopyMode === "copy-sheet" ? "copy-sheet" : "reference";
}

function normalizeReferenceStrength(
  referenceStrength: CreatePayload["referenceStrength"],
): CreatePayload["referenceStrength"] {
  if (referenceStrength === "reference" || referenceStrength === "product") {
    return referenceStrength;
  }

  return "balanced";
}

function normalizeReferenceRemakeGoal(
  referenceRemakeGoal: CreatePayload["referenceRemakeGoal"],
): CreatePayload["referenceRemakeGoal"] {
  if (
    referenceRemakeGoal === "soft-remake" ||
    referenceRemakeGoal === "structure-remake" ||
    referenceRemakeGoal === "semantic-remake"
  ) {
    return referenceRemakeGoal;
  }

  return "hard-remake";
}

function normalizeReferenceCompositionLock(
  referenceCompositionLock: CreatePayload["referenceCompositionLock"],
): CreatePayload["referenceCompositionLock"] {
  if (referenceCompositionLock === "strict" || referenceCompositionLock === "flexible") {
    return referenceCompositionLock;
  }

  return "balanced";
}

function normalizeReferenceTextRegionPolicy(
  referenceTextRegionPolicy: CreatePayload["referenceTextRegionPolicy"],
): CreatePayload["referenceTextRegionPolicy"] {
  if (referenceTextRegionPolicy === "leave-space" || referenceTextRegionPolicy === "remove") {
    return referenceTextRegionPolicy;
  }

  return "preserve";
}

function normalizeReferenceBackgroundMode(
  referenceBackgroundMode: CreatePayload["referenceBackgroundMode"],
): CreatePayload["referenceBackgroundMode"] {
  if (referenceBackgroundMode === "simplify" || referenceBackgroundMode === "regenerate") {
    return referenceBackgroundMode;
  }

  return "preserve";
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
      referenceRemakeGoal: normalizeReferenceRemakeGoal(payload.referenceRemakeGoal),
      referenceStrength: normalizeReferenceStrength(payload.referenceStrength),
      referenceCompositionLock: normalizeReferenceCompositionLock(payload.referenceCompositionLock),
      referenceTextRegionPolicy: normalizeReferenceTextRegionPolicy(payload.referenceTextRegionPolicy),
      referenceBackgroundMode: normalizeReferenceBackgroundMode(payload.referenceBackgroundMode),
      preserveReferenceText: payload.preserveReferenceText ?? true,
      referenceCopyMode: normalizeReferenceCopyMode(payload.referenceCopyMode),
      referenceExtraPrompt: payload.referenceExtraPrompt ?? "",
      referenceNegativePrompt: payload.referenceNegativePrompt ?? "",
      referenceLayoutOverride: null,
      referencePosterCopyOverride: null,
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
    return {
      ...payload,
      generationSemantics,
      selectedTypes: ["scene"],
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
  const generationSemantics = normalizeGenerationSemantics(payload.generationSemantics);
  const selectedTypes = payload.selectedTypes ?? [];
  const selectedRatios = payload.selectedRatios ?? [];
  const selectedResolutions = payload.selectedResolutions ?? [];

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

  if (creationMode === "prompt" && !payload.customPrompt?.trim()) {
    throw new GenerationRequestError("Prompt mode requires a text prompt.");
  }

  if (creationMode !== "prompt" && input.sourceFileCount === 0) {
    throw new GenerationRequestError("Missing files.");
  }

  if (creationMode === "reference-remix" && input.referenceFileCount === 0) {
    throw new GenerationRequestError("Reference remix mode requires at least one reference image.");
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
        ? `The current image model supports up to ${maxImagesPerPrompt} total input images per remake request. Current selection would send ${requestImageCount}.`
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

  const totalVariants = getPlannedRequestCount({
    creationMode,
    generationSemantics,
    sourceImageCount: input.sourceFileCount,
    typeCount: selectedTypes.length,
    ratioCount: selectedRatios.length,
    resolutionCount: selectedResolutions.length,
    variantsPerType: payload.variantsPerType,
  });

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
