import "server-only";

import { normalizeGenerationSemantics } from "@/lib/generation-semantics";
import type {
  AssetRecord,
  CreateJobInput,
  GenerationSemantics,
  JobDetails,
  JobItemRecord,
  MarketingImageStrategy,
  MarketingStrategy,
  ProviderOverride,
  ReferenceCompositionLock,
  ReferenceBackgroundMode,
  ReferenceCopyMode,
  ReferenceLayoutAnalysis,
  ReferenceRemakeGoal,
  ReferencePosterCopy,
  ReferenceTextRegionPolicy,
  StrategyWorkflowMode,
  UiLanguage,
} from "@/lib/types";
import { buildCompositeSourceDescription } from "@/lib/creative-fields";
import { normalizeCreatePayload } from "@/lib/server/generation/payload";
import { createId, dimensionsForVariant, nowIso } from "@/lib/utils";

function normalizeJobNameCandidate(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 48);
}

function inferNameFromAssets(...groups: AssetRecord[][]) {
  for (const group of groups) {
    for (const asset of group) {
      const candidate = normalizeJobNameCandidate(asset.originalName.replace(/\.[^.]+$/, ""));
      if (candidate) {
        return candidate;
      }
    }
  }

  return "";
}

function inferJobName(payload: CreatePayload, sourceAssets: AssetRecord[], referenceAssets: AssetRecord[]) {
  const explicitName = payload.productName.trim();
  if (explicitName) {
    return explicitName;
  }

  if (payload.creationMode === "standard") {
    return explicitName;
  }

  if (payload.creationMode === "suite") {
    const fallbackText =
      normalizeJobNameCandidate(payload.brandName) ||
      normalizeJobNameCandidate(payload.category) ||
      normalizeJobNameCandidate(payload.sourceDescription) ||
      normalizeJobNameCandidate(payload.sellingPoints);

    return fallbackText || inferNameFromAssets(sourceAssets, referenceAssets) || "Image set job";
  }

  if (payload.creationMode === "amazon-a-plus") {
    const fallbackText =
      normalizeJobNameCandidate(payload.brandName) ||
      normalizeJobNameCandidate(payload.category) ||
      normalizeJobNameCandidate(payload.sourceDescription) ||
      normalizeJobNameCandidate(payload.sellingPoints);

    return fallbackText || inferNameFromAssets(sourceAssets, referenceAssets) || "Amazon A+ job";
  }

  if (payload.creationMode === "reference-remix") {
    const fallbackText =
      normalizeJobNameCandidate(payload.sourceDescription) ||
      normalizeJobNameCandidate(payload.sellingPoints) ||
      normalizeJobNameCandidate(payload.brandName);

    return fallbackText || inferNameFromAssets(sourceAssets, referenceAssets) || "Reference remix job";
  }

  const promptInputs = normalizePromptInputs(payload);
  const normalized = normalizeJobNameCandidate(promptInputs[0] ?? payload.customPrompt ?? "");

  return normalized || "Prompt job";
}

function normalizePromptInputs(payload: {
  customPrompt?: string;
  promptInputs?: string[];
}): string[] {
  const explicitInputs = Array.isArray(payload.promptInputs)
    ? payload.promptInputs.map((value) => value.trim()).filter(Boolean)
    : [];

  if (explicitInputs.length > 0) {
    return explicitInputs;
  }

  const fallback = payload.customPrompt?.trim() || "";
  return fallback ? [fallback] : [];
}

function normalizeStructuredSelectedTypes(payload: {
  selectedTypes: string[];
  sizeInfo?: string;
}) {
  const normalized = Array.isArray(payload.selectedTypes)
    ? payload.selectedTypes.map((value) => value.trim()).filter(Boolean)
    : [];

  const filtered = normalized.filter((type) => payload.sizeInfo?.trim() || type !== "size-spec");
  if (payload.sizeInfo?.trim() && !filtered.includes("size-spec")) {
    filtered.push("size-spec");
  }

  return filtered;
}

export interface CreatePayload {
  creationMode?: "standard" | "reference-remix" | "prompt" | "suite" | "amazon-a-plus";
  generationSemantics?: GenerationSemantics;
  strategyWorkflowMode?: StrategyWorkflowMode;
  referenceRemakeGoal?: ReferenceRemakeGoal;
  referenceStrength?: "reference" | "balanced" | "product";
  referenceCompositionLock?: ReferenceCompositionLock;
  referenceTextRegionPolicy?: ReferenceTextRegionPolicy;
  referenceBackgroundMode?: ReferenceBackgroundMode;
  preserveReferenceText?: boolean;
  referenceCopyMode?: ReferenceCopyMode;
  productName: string;
  sku: string;
  brandName: string;
  category: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  customPrompt?: string;
  promptInputs?: string[];
  customNegativePrompt?: string;
  translatePromptToOutputLanguage?: boolean;
  autoOptimizePrompt?: boolean;
  referenceExtraPrompt?: string;
  referenceNegativePrompt?: string;
  country: string;
  language: string;
  platform: string;
  selectedTypes: string[];
  selectedRatios: string[];
  selectedResolutions: string[];
  variantsPerType: number;
  includeCopyLayout: boolean;
  uiLanguage: UiLanguage;
  selectedTemplateOverrides?: Record<string, string>;
  marketingStrategy?: MarketingStrategy | null;
  imageStrategies?: MarketingImageStrategy[] | null;
  referenceLayoutOverride?: ReferenceLayoutAnalysis | null;
  referencePosterCopyOverride?: ReferencePosterCopy | null;
  temporaryProvider?: ProviderOverride;
}

function isMarketingStrategyMode(creationMode: CreatePayload["creationMode"]) {
  return creationMode === "standard" || creationMode === "suite" || creationMode === "amazon-a-plus";
}

function normalizeImageStrategies(payload: {
  imageStrategies?: MarketingImageStrategy[] | null;
  selectedRatios?: string[];
}): MarketingImageStrategy[] {
  return (payload.imageStrategies ?? [])
    .filter((strategy): strategy is MarketingImageStrategy => Boolean(strategy && typeof strategy === "object"))
    .map((strategy, index) => ({
      ...strategy,
      id: strategy.id?.trim() || createId(`strategy-${index + 1}`),
      imageType: strategy.imageType?.trim() || `strategy-${index + 1}`,
      title: strategy.title?.trim() || strategy.imageType?.trim() || `Strategy ${index + 1}`,
      marketingRole: strategy.marketingRole?.trim() || strategy.title?.trim() || `Role ${index + 1}`,
      primarySellingPoint: strategy.primarySellingPoint?.trim() || "",
      sceneType: strategy.sceneType?.trim() || "",
      compositionGuidance: strategy.compositionGuidance?.trim() || "",
      copySpaceGuidance: strategy.copySpaceGuidance?.trim() || "",
      moodLighting: strategy.moodLighting?.trim() || "",
      outputRatio: strategy.outputRatio?.trim() || payload.selectedRatios?.[0] || "1:1",
      whyNeeded: strategy.whyNeeded?.trim() || "",
      strategyEdited: Boolean(strategy.strategyEdited),
    }))
    .filter((strategy) => Boolean(strategy.title.trim()));
}

function dedupeImageStrategies(strategies: Array<MarketingImageStrategy | null | undefined>): MarketingImageStrategy[] {
  const seen = new Set<string>();
  const deduped: MarketingImageStrategy[] = [];

  for (const strategy of strategies) {
    if (!strategy) {
      continue;
    }

    const key =
      strategy.id?.trim() ||
      [
        strategy.imageType?.trim() || "",
        strategy.title?.trim() || "",
        strategy.outputRatio?.trim() || "",
      ].join("::");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(strategy);
  }

  return deduped;
}

export function buildJobItems(sourceAssets: AssetRecord[], payload: CreatePayload, jobId: string): JobItemRecord[] {
  const items: JobItemRecord[] = [];
  const now = nowIso();
  const generationSemantics = normalizeGenerationSemantics(payload.generationSemantics);
  const promptInputs = payload.creationMode === "prompt" ? normalizePromptInputs(payload) : [];
  const structuredSelectedTypes = isMarketingStrategyMode(payload.creationMode)
    ? normalizeStructuredSelectedTypes(payload)
    : [];
  const sourceAssetEntries =
    payload.creationMode === "prompt"
      ? sourceAssets.length > 0
        ? [
            {
              id: sourceAssets[0]!.id,
              originalName: sourceAssets[0]!.originalName,
            },
          ]
        : [{ id: "", originalName: "prompt-only" }]
      : sourceAssets.length > 0
      ? generationSemantics === "joint"
        ? [
            {
              id: sourceAssets[0]!.id,
              originalName: sourceAssets[0]!.originalName,
            },
          ]
        : sourceAssets.map((asset) => ({
            id: asset.id,
            originalName: asset.originalName,
          }))
      : [];
  if (isMarketingStrategyMode(payload.creationMode)) {
    const strategySourceEntries = sourceAssets.length > 0
      ? generationSemantics === "joint"
        ? [
            {
              id: sourceAssets[0]!.id,
              originalName: sourceAssets[0]!.originalName,
            },
          ]
        : sourceAssets.map((asset) => ({
            id: asset.id,
            originalName: asset.originalName,
          }))
      : [{ id: "", originalName: "strategy-only" }];
    const ratio = payload.selectedRatios[0] || "1:1";
    const resolutionLabel = payload.selectedResolutions[0] || "1K";

    for (const sourceAsset of strategySourceEntries) {
      for (const imageType of structuredSelectedTypes) {
        for (let variantIndex = 1; variantIndex <= payload.variantsPerType; variantIndex += 1) {
          const { width, height } = dimensionsForVariant(ratio, resolutionLabel);
          items.push({
            id: createId("item"),
            jobId,
            sourceAssetId: sourceAsset.id,
            sourceAssetName: sourceAsset.originalName,
            imageType: imageType as JobItemRecord["imageType"],
            ratio,
            resolutionLabel,
            width,
            height,
            variantIndex,
            promptInputIndex: 0,
            imageStrategy: null,
            strategyEdited: false,
            visualAudit: null,
            generationAttempt: 0,
            autoRetriedFromAudit: false,
            status: "queued",
            promptText: null,
            negativePrompt: null,
            copyJson: null,
            generatedAssetId: null,
            layoutAssetId: null,
            reviewStatus: "unreviewed",
            createdAt: now,
            updatedAt: now,
            errorMessage: null,
            warningMessage: null,
            providerDebug: null,
          });
        }
      }
    }

    return items;
  }
  const promptInputIndices = payload.creationMode === "prompt" ? promptInputs.map((_, index) => index) : [0];
  const variantCount = payload.creationMode === "prompt" ? 1 : payload.variantsPerType;

  for (const sourceAsset of sourceAssetEntries) {
    for (const imageType of payload.selectedTypes) {
      for (const ratio of payload.selectedRatios) {
        for (const resolutionLabel of payload.selectedResolutions) {
          for (const promptInputIndex of promptInputIndices) {
            for (let variantIndex = 1; variantIndex <= variantCount; variantIndex += 1) {
              const { width, height } = dimensionsForVariant(ratio, resolutionLabel);
              items.push({
                id: createId("item"),
                jobId,
                sourceAssetId: sourceAsset.id,
                sourceAssetName: sourceAsset.originalName,
                imageType: imageType as JobItemRecord["imageType"],
                ratio,
                resolutionLabel,
                width,
                height,
                variantIndex,
                promptInputIndex,
                imageStrategy: null,
                strategyEdited: false,
                visualAudit: null,
                generationAttempt: 0,
                autoRetriedFromAudit: false,
                status: "queued",
                promptText: null,
                negativePrompt: null,
                copyJson: null,
                generatedAssetId: null,
                layoutAssetId: null,
                reviewStatus: "unreviewed",
                createdAt: now,
                updatedAt: now,
                errorMessage: null,
                warningMessage: null,
                providerDebug: null,
              });
            }
          }
        }
      }
    }
  }

  return items;
}

export function buildCreateJobInput(
  sourceAssets: AssetRecord[],
  payload: CreatePayload,
  jobId = createId("job"),
  referenceAssets: AssetRecord[] = [],
): CreateJobInput {
  const normalizedPayload = normalizeCreatePayload(payload);
  const promptInputs = normalizedPayload.creationMode === "prompt" ? normalizePromptInputs(normalizedPayload) : [];
  const promptModePrimaryPrompt =
    normalizedPayload.creationMode === "prompt"
      ? promptInputs[0] ?? normalizedPayload.customPrompt ?? ""
      : normalizedPayload.customPrompt ?? "";
  const items = buildJobItems(sourceAssets, normalizedPayload, jobId);

  return {
    id: jobId,
    creationMode: normalizedPayload.creationMode ?? "standard",
    generationSemantics: normalizeGenerationSemantics(normalizedPayload.generationSemantics),
    strategyWorkflowMode: normalizedPayload.strategyWorkflowMode ?? "quick",
    referenceRemakeGoal: normalizedPayload.referenceRemakeGoal ?? "hard-remake",
    referenceStrength: normalizedPayload.referenceStrength ?? "balanced",
    referenceCompositionLock: normalizedPayload.referenceCompositionLock ?? "balanced",
    referenceTextRegionPolicy: normalizedPayload.referenceTextRegionPolicy ?? "preserve",
    referenceBackgroundMode: normalizedPayload.referenceBackgroundMode ?? "preserve",
    preserveReferenceText: normalizedPayload.preserveReferenceText ?? true,
    referenceCopyMode: normalizedPayload.referenceCopyMode ?? "reference",
    productName: inferJobName(normalizedPayload, sourceAssets, referenceAssets),
    sku: normalizedPayload.sku,
    category: normalizedPayload.category,
    brandName: normalizedPayload.brandName,
    sellingPoints: normalizedPayload.sellingPoints,
    restrictions: normalizedPayload.restrictions,
    customPrompt: promptModePrimaryPrompt,
    promptInputs,
    customNegativePrompt: normalizedPayload.customNegativePrompt ?? "",
    translatePromptToOutputLanguage: normalizedPayload.translatePromptToOutputLanguage ?? false,
    autoOptimizePrompt: normalizedPayload.autoOptimizePrompt ?? false,
    country: normalizedPayload.country,
    language: normalizedPayload.language,
    platform: normalizedPayload.platform,
    referenceExtraPrompt: normalizedPayload.referenceExtraPrompt ?? "",
    referenceNegativePrompt: normalizedPayload.referenceNegativePrompt ?? "",
    selectedTypes: isMarketingStrategyMode(normalizedPayload.creationMode)
      ? normalizeStructuredSelectedTypes(normalizedPayload)
      : normalizedPayload.selectedTypes,
    selectedRatios: normalizedPayload.selectedRatios,
    selectedResolutions: normalizedPayload.selectedResolutions,
    variantsPerType: normalizedPayload.creationMode === "prompt" ? 1 : normalizedPayload.variantsPerType,
    includeCopyLayout: false,
    batchFileCount: sourceAssets.length,
    sourceDescription: buildCompositeSourceDescription({
      sourceDescription: normalizedPayload.sourceDescription,
      materialInfo: normalizedPayload.materialInfo,
      sizeInfo: normalizedPayload.sizeInfo,
    }),
    uiLanguage: normalizedPayload.uiLanguage,
    selectedTemplateOverrides: normalizedPayload.selectedTemplateOverrides ?? {},
    marketingStrategy: normalizedPayload.marketingStrategy ?? null,
    referenceLayoutOverride: normalizedPayload.referenceLayoutOverride ?? null,
    referencePosterCopyOverride: normalizedPayload.referencePosterCopyOverride ?? null,
    sourceAssets: sourceAssets.map((asset) => ({ ...asset, jobId })),
    referenceAssets: referenceAssets.map((asset) => ({ ...asset, jobId })),
    items,
  };
}

export function buildRetryJobInput(details: JobDetails): CreateJobInput {
  const sourceAssets = details.sourceAssets.map((asset) => ({
    ...asset,
    id: createId("asset"),
    jobId: "",
    jobItemId: null,
    createdAt: nowIso(),
  }));

  const referenceAssets = details.referenceAssets.map((asset) => ({
    ...asset,
    id: createId("asset"),
    jobId: "",
    jobItemId: null,
    createdAt: nowIso(),
  }));

  return buildCreateJobInput(
    sourceAssets,
    {
      creationMode: details.job.creationMode,
      generationSemantics: details.job.generationSemantics,
      strategyWorkflowMode: details.job.strategyWorkflowMode,
      referenceRemakeGoal: details.job.referenceRemakeGoal,
      referenceStrength: details.job.referenceStrength,
      referenceCompositionLock: details.job.referenceCompositionLock,
      referenceTextRegionPolicy: details.job.referenceTextRegionPolicy,
      referenceBackgroundMode: details.job.referenceBackgroundMode,
      preserveReferenceText: details.job.preserveReferenceText,
      referenceCopyMode: details.job.referenceCopyMode,
      productName: details.job.productName,
      sku: details.job.sku,
      brandName: details.job.brandName,
      category: details.job.category,
      sellingPoints: details.job.sellingPoints,
      restrictions: details.job.restrictions,
      sourceDescription: details.job.sourceDescription,
      customPrompt: details.job.customPrompt,
      promptInputs: details.job.promptInputs,
      customNegativePrompt: details.job.customNegativePrompt,
      translatePromptToOutputLanguage: details.job.translatePromptToOutputLanguage,
      autoOptimizePrompt: details.job.autoOptimizePrompt,
      referenceExtraPrompt: details.job.referenceExtraPrompt,
      referenceNegativePrompt: details.job.referenceNegativePrompt,
      country: details.job.country,
      language: details.job.language,
      platform: details.job.platform,
      selectedTypes: details.job.selectedTypes,
      selectedRatios: details.job.selectedRatios,
      selectedResolutions: details.job.selectedResolutions,
      variantsPerType: details.job.variantsPerType,
      includeCopyLayout: false,
      uiLanguage: details.job.uiLanguage,
      selectedTemplateOverrides: details.job.selectedTemplateOverrides,
      marketingStrategy: details.job.marketingStrategy,
      imageStrategies: dedupeImageStrategies(details.items.map((item) => item.imageStrategy)),
      referenceLayoutOverride: details.job.referenceLayoutOverride,
      referencePosterCopyOverride: details.job.referencePosterCopyOverride,
    },
    undefined,
    referenceAssets,
  );
}
