import "server-only";

import { resolveProviderType } from "@/lib/provider-router";

import {
  analyzeProductImageFeatures as analyzeGeminiProductImageFeatures,
  generateEditedImage,
  generateFeaturePromptCopyBundle,
  generateModeWorkflowCopyBundle,
  generateSharedModeAnalysis,
  normalizeProviderError,
  optimizeUserImagePrompt,
  runVisualAudit,
  translateUserPromptInputs,
} from "@/lib/gemini";
import { splitCompositeSourceDescription } from "@/lib/creative-fields";
import {
  getAssetById,
  getBrandByName,
  getJobById,
  getJobDetails,
  getSettings,
  insertAsset,
  listJobItems,
  resetJobItemsToQueued,
  updateJobFeishuSyncState,
  updateJobItemFailure,
  updateJobItemProcessing,
  updateJobItemResult,
  updateJobItemWarning,
  updateJobLocalizedInputs,
  updateJobReferenceArtifacts,
  updateJobStatus,
} from "@/lib/db";
import { syncJobToFeishu } from "@/lib/feishu";
import { meetsRequestedResolutionBucket } from "@/lib/image-size-policy";
import { resolveImageTypePrompt } from "@/lib/image-type-prompts";
import { readAssetBuffer, writeFileAsset } from "@/lib/storage";
import { buildPromptModeCopyBundle } from "@/lib/templates";
import type { GeneratedCopyBundle, ProviderOverride, VisualAudit } from "@/lib/types";
import { detectImageDimensions } from "@/lib/utils";

import {
  buildJobItemDimensionWarning,
  extensionForMimeType,
  settleJobStatusFromItems,
  shouldRetryForResolutionBucket,
  syncJobSummaryToFeishu,
  withProviderDebugContext,
} from "./process-helpers";
import { normalizeGenerationSemantics } from "@/lib/generation-semantics";

type ProductImageFeatureAnalysisResult = Awaited<ReturnType<typeof analyzeGeminiProductImageFeatures>>;

function normalizePromptInputs(input: { promptInputs: string[]; customPrompt: string }): string[] {
  const explicitInputs = Array.isArray(input.promptInputs)
    ? input.promptInputs.map((value) => value.trim()).filter(Boolean)
    : [];

  if (explicitInputs.length > 0) {
    return explicitInputs;
  }

  const fallback = input.customPrompt.trim();
  return fallback ? [fallback] : [""];
}

export async function processJob(jobId: string, providerOverride?: ProviderOverride) {
  const job = getJobById(jobId);
  if (!job) {
    throw new Error(`Job ${jobId} not found.`);
  }

  const jobDetails = getJobDetails(jobId);
  const sourceAssets = jobDetails?.sourceAssets ?? [];
  const referenceAssets = jobDetails?.referenceAssets ?? [];
  const generationSemantics = normalizeGenerationSemantics(job.generationSemantics);

  const settings = getSettings();
  const apiKey = providerOverride?.apiKey || settings.defaultApiKey;
  const apiBaseUrl = providerOverride?.apiBaseUrl ?? settings.defaultApiBaseUrl;
  const apiVersion = providerOverride?.apiVersion ?? settings.defaultApiVersion;
  const apiHeaders = providerOverride?.apiHeaders ?? settings.defaultApiHeaders;
  const textModel = providerOverride?.textModel || settings.defaultTextModel;
  const imageModel = providerOverride?.imageModel || settings.defaultImageModel;

  const providerType = resolveProviderType(providerOverride?.provider ?? settings.defaultProvider);

  if (!apiKey) {
    updateJobStatus(jobId, "failed", "API key is missing.");
    return;
  }

  if (job.creationMode === "reference-remix" && referenceAssets.length === 0) {
    updateJobStatus(jobId, "failed", "Reference remix mode requires exactly 1 reference image.");
    return;
  }

  resetJobItemsToQueued(jobId);
  const items = listJobItems(jobId);
  const queuedItems = items.filter((item) => item.status === "queued");
  if (!queuedItems.length) {
    settleJobStatusFromItems(jobId);
    return;
  }

  updateJobStatus(jobId, "processing");
  const rawCreativeFields = splitCompositeSourceDescription(job.sourceDescription);

  updateJobLocalizedInputs(jobId, null);

  const promptModePromptInputs =
    job.creationMode === "prompt"
      ? normalizePromptInputs({
          promptInputs: job.promptInputs,
          customPrompt: job.customPrompt,
        })
      : [];

  const translatedPromptModeInputs =
    job.creationMode === "prompt" && job.translatePromptToOutputLanguage
      ? await Promise.all(
          promptModePromptInputs.map(async (promptInput) => {
            if (!promptInput.trim()) {
              return promptInput;
            }

            return await (providerType === "openai"
              ? import("@/lib/openai-provider").then((m) =>
                  m.translateUserPromptInputs({
                    apiKey,
                    textModel,
                    apiBaseUrl,
                    apiVersion,
                    apiHeaders,
                    country: job.country,
                    language: job.language,
                    platform: job.platform,
                    customPrompt: promptInput,
                  }),
                )
              : translateUserPromptInputs({
                  apiKey,
                  textModel,
                  apiBaseUrl,
                  apiVersion,
                  apiHeaders,
                  country: job.country,
                  language: job.language,
                  platform: job.platform,
                  customPrompt: promptInput,
                })
            )
              .then((result) => result.customPrompt)
              .catch(() => promptInput);
          }),
        )
      : promptModePromptInputs;

  const effectiveInputs = {
    productName: job.productName,
    sellingPoints: job.sellingPoints,
    restrictions: job.restrictions,
    sourceDescription: rawCreativeFields.sourceDescription,
    materialInfo: rawCreativeFields.materialInfo,
    sizeInfo: rawCreativeFields.sizeInfo,
  };
  const brandProfile = job.brandName ? getBrandByName(job.brandName) : null;
  const structuredAgentMode =
    job.creationMode === "standard" || job.creationMode === "suite" || job.creationMode === "amazon-a-plus"
      ? job.creationMode
      : null;
  const workflowMode = job.creationMode === "reference-remix" ? job.creationMode : null;
  const primarySourceAsset = sourceAssets[0] ?? null;
  const primaryReferenceAsset = referenceAssets[0] ?? null;
  const structuredFeatureAnalysisCache = new Map<string, Promise<ProductImageFeatureAnalysisResult>>();

  const workflowAnalysisSourceBuffer = workflowMode && primarySourceAsset ? await readAssetBuffer(primarySourceAsset) : null;
  const workflowAnalysisRefBuffer =
    workflowMode && (workflowMode === "reference-remix" || workflowMode === "standard") && primaryReferenceAsset
      ? await readAssetBuffer(primaryReferenceAsset)
      : null;

  const workflowAnalysis =
    workflowMode && primarySourceAsset && workflowAnalysisSourceBuffer
      ? await (providerType === "openai"
          ? import("@/lib/openai-provider").then((m) =>
              m.generateSharedModeAnalysis({
                apiKey,
                textModel,
                apiBaseUrl,
                apiVersion,
                apiHeaders,
                mode: workflowMode,
                sourceImage: {
                  mimeType: primarySourceAsset.mimeType,
                  buffer: workflowAnalysisSourceBuffer,
                },
                referenceImage:
                  workflowAnalysisRefBuffer && primaryReferenceAsset
                    ? {
                        mimeType: primaryReferenceAsset.mimeType,
                        buffer: workflowAnalysisRefBuffer,
                      }
                    : null,
                country: job.country,
                language: job.language,
                platform: job.platform,
                category: job.category,
                productName: effectiveInputs.productName,
                brandName: job.brandName,
                sellingPoints: effectiveInputs.sellingPoints,
                restrictions: effectiveInputs.restrictions,
                sourceDescription: effectiveInputs.sourceDescription,
                materialInfo: effectiveInputs.materialInfo,
                sizeInfo: effectiveInputs.sizeInfo,
                imageType: job.creationMode === "standard" ? "scene" : undefined,
              }),
            )
          : generateSharedModeAnalysis({
              apiKey,
              textModel,
              apiBaseUrl,
              apiVersion,
              apiHeaders,
              mode: workflowMode,
              sourceImage: {
                mimeType: primarySourceAsset.mimeType,
                buffer: await readAssetBuffer(primarySourceAsset),
              },
              referenceImage:
                (workflowMode === "reference-remix" || workflowMode === "standard") && primaryReferenceAsset
                  ? {
                      mimeType: primaryReferenceAsset.mimeType,
                      buffer: await readAssetBuffer(primaryReferenceAsset),
                    }
                  : null,
              country: job.country,
              language: job.language,
              platform: job.platform,
              category: job.category,
              productName: effectiveInputs.productName,
              brandName: job.brandName,
              sellingPoints: effectiveInputs.sellingPoints,
              restrictions: effectiveInputs.restrictions,
              sourceDescription: effectiveInputs.sourceDescription,
              materialInfo: effectiveInputs.materialInfo,
              sizeInfo: effectiveInputs.sizeInfo,
              imageType: job.creationMode === "standard" ? "scene" : undefined,
            })
        ).catch(() => null)
      : null;

  if (job.creationMode === "reference-remix") {
    const primaryReferenceAsset = referenceAssets[0];
    if (!primaryReferenceAsset) {
      updateJobStatus(jobId, "failed", "Reference remix mode requires exactly 1 reference image.");
      return;
    }

    updateJobReferenceArtifacts(jobId, null, null);
  }

  for (const item of queuedItems) {
    let copy: GeneratedCopyBundle | null = null;
    let visualAudit: VisualAudit | null = null;
    let generationAttemptUsed = 0;
    let autoRetriedFromAudit = false;
    try {
      updateJobItemProcessing(item.id);
      const sourceAsset = item.sourceAssetId ? getAssetById(item.sourceAssetId) : null;
      if (!sourceAsset && job.creationMode !== "prompt") {
        throw new Error("Source asset not found.");
      }
      const promptInputIndex =
        job.creationMode === "prompt"
          ? Math.min(Math.max(item.promptInputIndex ?? 0, 0), Math.max(translatedPromptModeInputs.length - 1, 0))
          : 0;
      const selectedPromptInput =
        job.creationMode === "prompt"
          ? translatedPromptModeInputs[promptInputIndex] ?? translatedPromptModeInputs[0] ?? job.customPrompt
          : "";

      const sourceImages =
        workflowMode
          ? sourceAsset
            ? [
                {
                  mimeType: sourceAsset.mimeType,
                  buffer: await readAssetBuffer(sourceAsset),
                },
              ]
            : []
          : generationSemantics === "joint"
            ? await Promise.all(
                sourceAssets.map(async (asset) => ({
                  mimeType: asset.mimeType,
                  buffer: await readAssetBuffer(asset),
                })),
              )
            : sourceAsset
              ? [
                  {
                    mimeType: sourceAsset.mimeType,
                    buffer: await readAssetBuffer(sourceAsset),
                  },
                ]
              : [];
      const referenceImages = await Promise.all(
        workflowMode === "reference-remix" && primaryReferenceAsset
          ? [
              {
                mimeType: primaryReferenceAsset.mimeType,
                buffer: await readAssetBuffer(primaryReferenceAsset),
              },
            ]
          : referenceAssets.map(async (asset) => ({
              mimeType: asset.mimeType,
              buffer: await readAssetBuffer(asset),
            })),
      );
      const requestImageCount = sourceImages.length + referenceImages.length;
      const requestBytes = [...sourceImages, ...referenceImages].reduce((total, image) => total + image.buffer.length, 0);
      const matchedTemplate = null;
      const currentStructuredFeatureAnalysis =
        structuredAgentMode && sourceImages.length > 0
          ? await (async () => {
              const cacheKey = generationSemantics === "joint" ? "joint" : sourceAsset?.id || item.sourceAssetId || item.id;
              if (!structuredFeatureAnalysisCache.has(cacheKey)) {
                const analysisInput = {
                  apiKey,
                  textModel,
                  apiBaseUrl,
                  apiVersion,
                  apiHeaders,
                  sourceImages,
                  country: job.country,
                  language: job.language,
                  platform: job.platform,
                  category: job.category,
                  productName: effectiveInputs.productName,
                  brandName: job.brandName,
                  sellingPoints: effectiveInputs.sellingPoints,
                  materialInfo: effectiveInputs.materialInfo,
                  sizeInfo: effectiveInputs.sizeInfo,
                };
                const analysisTask =
                  providerType === "openai"
                    ? import("@/lib/openai-provider").then((m) => m.analyzeProductImageFeatures(analysisInput))
                    : analyzeGeminiProductImageFeatures(analysisInput);

                structuredFeatureAnalysisCache.set(
                  cacheKey,
                  analysisTask.catch(() => ({
                    mainSubject: effectiveInputs.productName || item.imageType,
                    categoryGuess: job.category || "general product",
                    coreFeatures: effectiveInputs.sellingPoints
                      ? effectiveInputs.sellingPoints.split(/[\n,，;；]/g).map((part: string) => part.trim()).filter(Boolean).slice(0, 4)
                      : [effectiveInputs.productName || item.imageType],
                    visualCharacteristics: effectiveInputs.materialInfo
                      ? effectiveInputs.materialInfo.split(/[\n,，;；]/g).map((part: string) => part.trim()).filter(Boolean).slice(0, 4)
                      : [effectiveInputs.productName || item.imageType],
                    materialSignals: effectiveInputs.materialInfo
                      ? effectiveInputs.materialInfo.split(/[\n,，;；]/g).map((part: string) => part.trim()).filter(Boolean).slice(0, 4)
                      : [effectiveInputs.productName || item.imageType],
                    mustPreserve: [
                      effectiveInputs.productName || item.imageType,
                      ...(
                        effectiveInputs.materialInfo
                          ? effectiveInputs.materialInfo.split(/[\n,，;；]/g).map((part: string) => part.trim()).filter(Boolean).slice(0, 3)
                          : []
                      ),
                    ].filter(Boolean),
                  })),
                );
              }

              return await structuredFeatureAnalysisCache.get(cacheKey)!;
            })()
          : null;
      const currentWorkflowAnalysis = workflowAnalysis;
      const imageTypePrompt = structuredAgentMode
        ? resolveImageTypePrompt({
            overridesJson: settings.imageTypePromptOverridesJson,
            mode: structuredAgentMode,
            imageType: item.imageType,
          })
        : undefined;

      copy =
        structuredAgentMode && currentStructuredFeatureAnalysis
          ? await (providerType === "openai"
              ? import("@/lib/openai-provider").then((m) =>
                  m.generateFeaturePromptCopyBundle({
                    apiKey,
                    textModel,
                    apiBaseUrl,
                    apiVersion,
                    apiHeaders,
                    mode: structuredAgentMode,
                    sourceImages,
                    analysis: currentStructuredFeatureAnalysis,
                    imageType: item.imageType,
                    country: job.country,
                    language: job.language,
                    platform: job.platform,
                    category: job.category,
                    productName: effectiveInputs.productName,
                    brandName: job.brandName,
                    sellingPoints: effectiveInputs.sellingPoints,
                    materialInfo: effectiveInputs.materialInfo,
                    sizeInfo: effectiveInputs.sizeInfo,
                    ratio: item.ratio,
                    resolutionLabel: item.resolutionLabel,
                    groupIndex: item.variantIndex,
                    groupCount: job.variantsPerType,
                    imageTypePrompt: imageTypePrompt,
                  }),
                )
              : generateFeaturePromptCopyBundle({
                  apiKey,
                  textModel,
                  apiBaseUrl,
                  apiVersion,
                  apiHeaders,
                  mode: structuredAgentMode,
                  sourceImages,
                  analysis: currentStructuredFeatureAnalysis,
                  imageType: item.imageType,
                  country: job.country,
                  language: job.language,
                  platform: job.platform,
                  category: job.category,
                  productName: effectiveInputs.productName,
                  brandName: job.brandName,
                  sellingPoints: effectiveInputs.sellingPoints,
                  materialInfo: effectiveInputs.materialInfo,
                  sizeInfo: effectiveInputs.sizeInfo,
                  ratio: item.ratio,
                  resolutionLabel: item.resolutionLabel,
                  groupIndex: item.variantIndex,
                  groupCount: job.variantsPerType,
                  imageTypePrompt: imageTypePrompt,
                }))
          : workflowMode
          ? await (providerType === "openai"
              ? import("@/lib/openai-provider").then((m) =>
                  m.generateModeWorkflowCopyBundle({
                    apiKey,
                    textModel,
                    apiBaseUrl,
                    apiVersion,
                    apiHeaders,
                    mode: workflowMode,
                    imageType: item.imageType,
                    analysis: currentWorkflowAnalysis,
                    country: job.country,
                    language: job.language,
                    platform: job.platform,
                    category: job.category,
                    productName: effectiveInputs.productName,
                    brandName: job.brandName,
                    sellingPoints: effectiveInputs.sellingPoints,
                    restrictions: effectiveInputs.restrictions,
                    sourceDescription: effectiveInputs.sourceDescription,
                    materialInfo: effectiveInputs.materialInfo,
                    sizeInfo: effectiveInputs.sizeInfo,
                    ratio: item.ratio,
                    resolutionLabel: item.resolutionLabel,
                    brandProfile,
                    template: matchedTemplate,
                  }),
                )
              : generateModeWorkflowCopyBundle({
                  apiKey,
                  textModel,
                  apiBaseUrl,
                  apiVersion,
                  apiHeaders,
                  mode: workflowMode,
                  imageType: item.imageType,
                  analysis: currentWorkflowAnalysis,
                  country: job.country,
                  language: job.language,
                  platform: job.platform,
                  category: job.category,
                  productName: effectiveInputs.productName,
                  brandName: job.brandName,
                  sellingPoints: effectiveInputs.sellingPoints,
                  restrictions: effectiveInputs.restrictions,
                  sourceDescription: effectiveInputs.sourceDescription,
                  materialInfo: effectiveInputs.materialInfo,
                  sizeInfo: effectiveInputs.sizeInfo,
                  ratio: item.ratio,
                  resolutionLabel: item.resolutionLabel,
                  brandProfile,
                  template: matchedTemplate,
                }))
            : job.creationMode === "prompt"
              ? buildPromptModeCopyBundle({
                  productName: effectiveInputs.productName,
                  customPrompt: selectedPromptInput,
                })
              : buildPromptModeCopyBundle({
                  productName: effectiveInputs.productName,
                  customPrompt: effectiveInputs.productName,
                });

      const promptModePrompt =
        job.creationMode === "prompt"
          ? job.autoOptimizePrompt
            ? await (providerType === "openai"
                ? import("@/lib/openai-provider").then((m) =>
                    m.optimizeUserImagePrompt({
                      apiKey,
                      textModel,
                      apiBaseUrl,
                      apiVersion,
                      apiHeaders,
                      country: job.country,
                      language: job.language,
                      platform: job.platform,
                      category: job.category,
                      productName: effectiveInputs.productName,
                      brandName: job.brandName,
                      sellingPoints: effectiveInputs.sellingPoints,
                      restrictions: effectiveInputs.restrictions,
                      sourceDescription: effectiveInputs.sourceDescription,
                      materialInfo: effectiveInputs.materialInfo,
                      sizeInfo: effectiveInputs.sizeInfo,
                      imageType: item.imageType,
                      ratio: item.ratio,
                      resolutionLabel: item.resolutionLabel,
                      customPrompt: selectedPromptInput,
                      translateToOutputLanguage: job.translatePromptToOutputLanguage,
                      hasSourceImages: sourceImages.length > 0,
                    }),
                  )
                : optimizeUserImagePrompt({
                    apiKey,
                    textModel,
                    apiBaseUrl,
                    apiVersion,
                    apiHeaders,
                    country: job.country,
                    language: job.language,
                    platform: job.platform,
                    category: job.category,
                    productName: effectiveInputs.productName,
                    brandName: job.brandName,
                    sellingPoints: effectiveInputs.sellingPoints,
                    restrictions: effectiveInputs.restrictions,
                    sourceDescription: effectiveInputs.sourceDescription,
                    materialInfo: effectiveInputs.materialInfo,
                    sizeInfo: effectiveInputs.sizeInfo,
                    imageType: item.imageType,
                    ratio: item.ratio,
                    resolutionLabel: item.resolutionLabel,
                    customPrompt: selectedPromptInput,
                    translateToOutputLanguage: job.translatePromptToOutputLanguage,
                    hasSourceImages: sourceImages.length > 0,
                  }))
            : selectedPromptInput
          : null;

      const imageInput = {
        apiKey,
        imageModel: providerType === "openai" ? textModel : imageModel,
        apiBaseUrl,
        apiVersion,
        apiHeaders,
        creationMode: job.creationMode,
        wrapPromptModeText: job.creationMode === "prompt",
        variantsPerType: job.variantsPerType,
        customPromptText:
          structuredAgentMode || workflowMode
            ? copy?.optimizedPrompt || ""
            : promptModePrompt ?? (job.creationMode === "prompt" ? selectedPromptInput : undefined),
        country: job.country,
        language: job.language,
        platform: job.platform,
        category: job.category,
        brandName: job.brandName,
        productName: effectiveInputs.productName,
        sellingPoints: effectiveInputs.sellingPoints,
        restrictions: effectiveInputs.restrictions,
        sourceDescription: effectiveInputs.sourceDescription,
        materialInfo: effectiveInputs.materialInfo,
        sizeInfo: effectiveInputs.sizeInfo,
        brandProfile,
        imageType: item.imageType,
        ratio: item.ratio,
        resolutionLabel: item.resolutionLabel,
        copy,
        referenceLayout: null,
        referencePosterCopy: null,
        template: matchedTemplate,
        requestedWidth: item.width,
        requestedHeight: item.height,
        sourceImages,
        referenceImages,
      };

      const maxGenerationAttempts = shouldRetryForResolutionBucket(imageModel, item.resolutionLabel) ? 3 : 1;
      let generated: Awaited<ReturnType<typeof generateEditedImage>> | null = null;
      let actualDimensions: ReturnType<typeof detectImageDimensions> = null;
      let effectivePromptText = imageInput.customPromptText;

      for (let generationAttempt = 1; generationAttempt <= Math.max(maxGenerationAttempts, 2); generationAttempt += 1) {
        generationAttemptUsed = generationAttempt;
        generated = await (providerType === "openai"
          ? import("@/lib/openai-provider").then((m) =>
              m.generateEditedImage({
                ...imageInput,
                copy: imageInput.copy ?? { optimizedPrompt: "", title: "", subtitle: "", highlights: [], detailAngles: [], painPoints: [], cta: "", posterHeadline: "", posterSubline: "" },
                customPromptText: effectivePromptText,
              } as any),
            )
          : generateEditedImage({
              ...imageInput,
              copy: imageInput.copy!,
              customPromptText: effectivePromptText,
            })) as any;
        actualDimensions = generated ? detectImageDimensions(generated.buffer, generated.mimeType) : null;

        if (
          !generated ||
          meetsRequestedResolutionBucket({
            requestedResolutionLabel: item.resolutionLabel,
            actualWidth: actualDimensions?.width ?? null,
            actualHeight: actualDimensions?.height ?? null,
          })
        ) {
          const shouldRunAudit = false;
          if (shouldRunAudit && generated) {
            visualAudit = await (providerType === "openai"
              ? import("@/lib/openai-provider").then((m) =>
                  m.runVisualAudit({
                    apiKey,
                    textModel,
                    apiBaseUrl,
                    apiVersion,
                    apiHeaders,
                    mode: structuredAgentMode!,
                    sourceImages,
                    generatedImage: {
                      mimeType: generated!.mimeType,
                      buffer: generated!.buffer,
                    },
                    marketingStrategy: job.marketingStrategy!,
                    imageStrategy: item.imageStrategy!,
                    promptText: generated!.promptText || effectivePromptText || "",
                  }),
                )
              : runVisualAudit({
                  apiKey,
                  textModel,
                  apiBaseUrl,
                  apiVersion,
                  apiHeaders,
                  mode: structuredAgentMode!,
                  sourceImages,
                  generatedImage: {
                    mimeType: generated.mimeType,
                    buffer: generated.buffer,
                  },
                  marketingStrategy: job.marketingStrategy!,
                  imageStrategy: item.imageStrategy!,
                  promptText: generated.promptText || effectivePromptText || "",
                })
            ).catch(() => null);

            if (visualAudit && !visualAudit.passes) {
              if (generationAttempt < 2) {
                autoRetriedFromAudit = true;
                effectivePromptText = [
                  effectivePromptText || generated.promptText || "",
                  "Audit repair instructions:",
                  ...visualAudit.repairHints,
                ]
                  .filter(Boolean)
                  .join("\n");
                continue;
              }

              const auditError = withProviderDebugContext(
                new Error(`Visual audit failed: ${visualAudit.reason}`),
                `Visual audit failed: ${visualAudit.reason}`,
              );
              auditError.providerDebug = {
                retrievalMethod: generated.providerDebug?.retrievalMethod ?? "inline",
                rawText: generated.providerDebug?.rawText ?? "",
                failureStage: "visual-audit",
                failureReason: visualAudit.reason,
                requestImageCount,
                requestBytes,
              };
              auditError.promptText = generated.promptText || effectivePromptText || "";
              throw auditError;
            }
          }

          break;
        }

        if (generationAttempt === maxGenerationAttempts) {
          const undersizedError = withProviderDebugContext(
            generated,
            `Provider returned a lower-than-requested image size for ${item.resolutionLabel}.`,
          );
          undersizedError.message = `Provider returned ${actualDimensions?.width ?? "unknown"}x${actualDimensions?.height ?? "unknown"} for requested ${item.resolutionLabel} bucket after ${maxGenerationAttempts} attempts. The current model or relay is not honoring the requested size bucket.`;
          throw undersizedError;
        }
      }

      if (!generated) {
        throw new Error("Image generation failed without returning any image data.");
      }

      const generatedAsset = await writeFileAsset({
        jobId,
        jobItemId: item.id,
        kind: "generated",
        originalName: `${job.productName}-${item.imageType}-${item.variantIndex}${extensionForMimeType(generated.mimeType)}`,
        mimeType: generated.mimeType,
        buffer: generated.buffer,
        width: item.width,
        height: item.height,
      });
      insertAsset(generatedAsset);
      const dimensionWarning = buildJobItemDimensionWarning({
        requestedRatio: item.ratio,
        requestedResolutionLabel: item.resolutionLabel,
        actualWidth: generatedAsset.width,
        actualHeight: generatedAsset.height,
        language: job.uiLanguage,
      });
      const workflowWarning = copy?.workflowWarning?.trim() || null;

      updateJobItemResult({
        itemId: item.id,
        promptText: generated.promptText || copy?.optimizedPrompt || "",
        negativePrompt: copy?.negativePrompt?.trim() || null,
        copy: copy!,
        generatedAssetId: generatedAsset.id,
        layoutAssetId: null,
        warningMessage: [dimensionWarning, workflowWarning].filter(Boolean).join(" | ") || null,
        providerDebug: {
          ...(generated.providerDebug ?? {}),
          requestedWidth: item.width,
          requestedHeight: item.height,
          actualWidth: generatedAsset.width ?? undefined,
          actualHeight: generatedAsset.height ?? undefined,
        },
        visualAudit,
        generationAttempt: generationAttemptUsed,
        autoRetriedFromAudit,
      });

      let syncWarning: string | null = null;
      try {
        const details = getJobDetails(jobId);
        const feishuState = details
          ? await syncJobToFeishu({
              settings,
              details,
              latestGeneratedAsset: generatedAsset,
              latestAssetBuffer: generated.buffer,
            })
          : null;

        if (feishuState) {
          updateJobFeishuSyncState(jobId, feishuState.recordId, feishuState.fileTokens);
        }
      } catch (syncError) {
        syncWarning = `Feishu sync failed: ${syncError instanceof Error ? syncError.message : "Unknown error."}`;
      }

      const warningMessage = [dimensionWarning, copy?.workflowWarning, syncWarning].filter(Boolean).join(" | ") || null;
      updateJobItemWarning(item.id, warningMessage);
    } catch (error) {
      const normalizedError = normalizeProviderError(error);
      const promptText =
        error && typeof error === "object" && "promptText" in error ? String((error as { promptText?: string }).promptText ?? "") : null;
      const providerDebug =
        error && typeof error === "object" && "providerDebug" in error
          ? ((error as { providerDebug?: typeof item.providerDebug }).providerDebug ?? null)
          : null;
      const failureMessage =
        job.creationMode === "reference-remix" ? `Reference remix generation failed: ${normalizedError}` : normalizedError;
      updateJobItemFailure(
        item.id,
        failureMessage,
        promptText,
        copy?.negativePrompt?.trim() || null,
        providerDebug,
        visualAudit,
        generationAttemptUsed,
        autoRetriedFromAudit,
      );

      try {
        await syncJobSummaryToFeishu(jobId, settings);
      } catch {
        // Swallow task-level sync errors on failed items so generation status remains authoritative.
      }
    }
  }

  settleJobStatusFromItems(jobId);
  try {
    await syncJobSummaryToFeishu(jobId, settings);
  } catch {
    // Keep task completion flow resilient if Feishu summary sync fails.
  }
}
