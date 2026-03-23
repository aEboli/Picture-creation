import "server-only";

import {
  generateEditedImage,
  generateModeWorkflowCopyBundle,
  generateSharedModeAnalysis,
  normalizeProviderError,
  optimizeUserImagePrompt,
  translateCreativeInputs,
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
import { readAssetBuffer, writeFileAsset } from "@/lib/storage";
import { buildPromptModeCopyBundle } from "@/lib/templates";
import type { GeneratedCopyBundle, ProviderOverride } from "@/lib/types";
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

  if (!apiKey) {
    updateJobStatus(jobId, "failed", "Gemini API key is missing.");
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

  const localizedInputs =
    job.creationMode === "prompt" || job.creationMode === "reference-remix"
      ? null
      : await translateCreativeInputs({
          apiKey,
          textModel: settings.defaultTextModel,
          apiBaseUrl,
          apiVersion,
          apiHeaders,
          country: job.country,
          language: job.language,
          platform: job.platform,
          category: job.category,
          brandName: job.brandName,
          sku: job.sku,
          productName: job.productName,
          sellingPoints: job.sellingPoints,
          restrictions: job.restrictions,
          sourceDescription: rawCreativeFields.sourceDescription,
          materialInfo: rawCreativeFields.materialInfo,
          sizeInfo: rawCreativeFields.sizeInfo,
        }).catch(() => null);
  updateJobLocalizedInputs(jobId, localizedInputs);

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

            return await translateUserPromptInputs({
              apiKey,
              textModel: settings.defaultTextModel,
              apiBaseUrl,
              apiVersion,
              apiHeaders,
              country: job.country,
              language: job.language,
              platform: job.platform,
              customPrompt: promptInput,
            })
              .then((result) => result.customPrompt)
              .catch(() => promptInput);
          }),
        )
      : promptModePromptInputs;

  const effectiveInputs = {
    productName: localizedInputs?.productName || job.productName,
    sellingPoints: localizedInputs?.sellingPoints || job.sellingPoints,
    restrictions: localizedInputs?.restrictions || job.restrictions,
    sourceDescription: localizedInputs?.sourceDescription || rawCreativeFields.sourceDescription,
    materialInfo: localizedInputs?.materialInfo || rawCreativeFields.materialInfo,
    sizeInfo: localizedInputs?.sizeInfo || rawCreativeFields.sizeInfo,
  };
  const brandProfile = job.brandName ? getBrandByName(job.brandName) : null;
  const workflowMode =
    job.creationMode === "standard" ||
    job.creationMode === "suite" ||
    job.creationMode === "amazon-a-plus" ||
    job.creationMode === "reference-remix"
      ? job.creationMode
      : null;
  const primarySourceAsset = sourceAssets[0] ?? null;
  const primaryReferenceAsset = referenceAssets[0] ?? null;

  const workflowAnalysis =
    workflowMode && primarySourceAsset
      ? await generateSharedModeAnalysis({
          apiKey,
          textModel: settings.defaultTextModel,
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
        }).catch(() => null)
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
      const matchedTemplate = null;
      const currentWorkflowAnalysis =
        job.creationMode === "standard" && sourceAsset
          ? await generateSharedModeAnalysis({
              apiKey,
              textModel: settings.defaultTextModel,
              apiBaseUrl,
              apiVersion,
              apiHeaders,
              mode: "standard",
              sourceImage: {
                mimeType: sourceAsset.mimeType,
                buffer: await readAssetBuffer(sourceAsset),
              },
              referenceImage: referenceAssets[0]
                ? {
                    mimeType: referenceAssets[0].mimeType,
                    buffer: await readAssetBuffer(referenceAssets[0]),
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
              imageType: item.imageType,
            }).catch(() => null)
          : workflowAnalysis;

      copy =
        workflowMode
          ? await generateModeWorkflowCopyBundle({
              apiKey,
              textModel: settings.defaultTextModel,
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
            })
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
            ? await optimizeUserImagePrompt({
                apiKey,
                textModel: settings.defaultTextModel,
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
              })
            : selectedPromptInput
          : null;

      const imageInput = {
        apiKey,
        imageModel: settings.defaultImageModel,
        apiBaseUrl,
        apiVersion,
        apiHeaders,
        creationMode: job.creationMode,
        wrapPromptModeText: job.creationMode === "prompt",
        variantsPerType: job.variantsPerType,
        customPromptText:
          workflowMode
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
        sourceImages,
        referenceImages,
      };

      const maxGenerationAttempts = shouldRetryForResolutionBucket(settings.defaultImageModel, item.resolutionLabel) ? 3 : 1;
      let generated: Awaited<ReturnType<typeof generateEditedImage>> | null = null;
      let actualDimensions: ReturnType<typeof detectImageDimensions> = null;

      for (let attempt = 1; attempt <= maxGenerationAttempts; attempt += 1) {
        generated = await generateEditedImage(imageInput);
        actualDimensions = detectImageDimensions(generated.buffer, generated.mimeType);

        if (
          !generated ||
          meetsRequestedResolutionBucket({
            requestedResolutionLabel: item.resolutionLabel,
            actualWidth: actualDimensions?.width ?? null,
            actualHeight: actualDimensions?.height ?? null,
          })
        ) {
          break;
        }

        if (attempt === maxGenerationAttempts) {
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
        copy,
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
