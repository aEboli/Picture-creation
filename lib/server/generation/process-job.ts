import "server-only";

import {
  generateCopyBundle,
  generateEditedImage,
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
  getTemplateById,
  insertAsset,
  listJobItems,
  resetJobItemsToQueued,
  resolveTemplate,
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
import { buildPromptModeCopyBundle, buildReferenceRemixCopyBundle } from "@/lib/templates";
import type { ProviderOverride } from "@/lib/types";
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
    updateJobStatus(jobId, "failed", "Reference remix mode requires at least one reference image.");
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

  const promptModeInputs =
    job.creationMode === "prompt"
      ? job.translatePromptToOutputLanguage
        ? await translateUserPromptInputs({
            apiKey,
            textModel: settings.defaultTextModel,
            apiBaseUrl,
            apiVersion,
            apiHeaders,
            country: job.country,
            language: job.language,
            platform: job.platform,
            customPrompt: job.customPrompt,
            customNegativePrompt: job.customNegativePrompt,
          }).catch(() => ({
            customPrompt: job.customPrompt,
            customNegativePrompt: job.customNegativePrompt,
          }))
        : {
            customPrompt: job.customPrompt,
            customNegativePrompt: job.customNegativePrompt,
          }
      : null;

  const effectiveInputs = {
    productName: localizedInputs?.productName || job.productName,
    sellingPoints: localizedInputs?.sellingPoints || job.sellingPoints,
    restrictions: localizedInputs?.restrictions || job.restrictions,
    sourceDescription: localizedInputs?.sourceDescription || rawCreativeFields.sourceDescription,
    materialInfo: localizedInputs?.materialInfo || rawCreativeFields.materialInfo,
    sizeInfo: localizedInputs?.sizeInfo || rawCreativeFields.sizeInfo,
  };
  const brandProfile = job.brandName ? getBrandByName(job.brandName) : null;

  if (job.creationMode === "reference-remix") {
    const primaryReferenceAsset = referenceAssets[0];
    if (!primaryReferenceAsset) {
      updateJobStatus(jobId, "failed", "Reference remix mode requires at least one reference image.");
      return;
    }

    updateJobReferenceArtifacts(jobId, null, null);
  }

  for (const item of queuedItems) {
    try {
      updateJobItemProcessing(item.id);
      const sourceAsset = item.sourceAssetId ? getAssetById(item.sourceAssetId) : null;
      if (!sourceAsset && job.creationMode !== "prompt") {
        throw new Error("Source asset not found.");
      }

      const sourceImages =
        generationSemantics === "joint"
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
        referenceAssets.map(async (asset) => ({
          mimeType: asset.mimeType,
          buffer: await readAssetBuffer(asset),
        })),
      );
      const overrideTemplateId = job.selectedTemplateOverrides[item.imageType];
      const matchedTemplate =
        job.creationMode === "reference-remix" || job.creationMode === "prompt"
          ? null
          : (overrideTemplateId ? getTemplateById(overrideTemplateId) : null) ??
            resolveTemplate({
              country: job.country,
              language: job.language,
              platform: job.platform,
              category: job.category,
              imageType: item.imageType,
            });

      const copy =
        job.creationMode === "reference-remix"
          ? buildReferenceRemixCopyBundle({
              productName:
                effectiveInputs.productName ||
                sourceAsset?.originalName.replace(/\.[^.]+$/, "") ||
                (job.uiLanguage === "zh" ? "参考改稿" : "Reference remake"),
              brandName: job.brandName,
              sellingPoints: effectiveInputs.sellingPoints,
              sourceDescription: effectiveInputs.sourceDescription,
              referenceCopyMode: job.referenceCopyMode,
            })
          : job.creationMode === "prompt"
            ? buildPromptModeCopyBundle({
                productName: effectiveInputs.productName,
                customPrompt: job.customPrompt,
              })
            : await generateCopyBundle({
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
                template: matchedTemplate,
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
                customPrompt: promptModeInputs?.customPrompt || job.customPrompt,
                customNegativePrompt: promptModeInputs?.customNegativePrompt || job.customNegativePrompt,
                translateToOutputLanguage: job.translatePromptToOutputLanguage,
              })
            : promptModeInputs?.customPrompt || job.customPrompt
          : null;

      const imageInput = {
        apiKey,
        imageModel: settings.defaultImageModel,
        apiBaseUrl,
        apiVersion,
        apiHeaders,
        creationMode: job.creationMode,
        referenceRemakeGoal: job.referenceRemakeGoal,
        referenceStrength: job.referenceStrength,
        referenceCompositionLock: job.referenceCompositionLock,
        referenceTextRegionPolicy: job.referenceTextRegionPolicy,
        referenceBackgroundMode: job.referenceBackgroundMode,
        preserveReferenceText: job.preserveReferenceText,
        referenceCopyMode: job.referenceCopyMode,
        variantsPerType: job.variantsPerType,
        customPromptText:
          promptModePrompt ?? (job.creationMode === "prompt" ? promptModeInputs?.customPrompt || job.customPrompt : undefined),
        customNegativePrompt:
          job.creationMode === "prompt"
            ? promptModeInputs?.customNegativePrompt || job.customNegativePrompt
            : undefined,
        referenceExtraPrompt: job.referenceExtraPrompt,
        referenceNegativePrompt: job.referenceNegativePrompt,
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
        sourceImages: [...sourceImages, ...referenceImages],
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

      updateJobItemResult({
        itemId: item.id,
        promptText: generated.promptText || copy.optimizedPrompt,
        negativePrompt:
          job.creationMode === "prompt"
            ? promptModeInputs?.customNegativePrompt || job.customNegativePrompt
            : null,
        copy,
        generatedAssetId: generatedAsset.id,
        layoutAssetId: null,
        warningMessage: dimensionWarning,
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

      const warningMessage = [dimensionWarning, syncWarning].filter(Boolean).join(" | ") || null;
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
        job.creationMode === "reference-remix" ? `Poster remake generation failed: ${normalizedError}` : normalizedError;
      updateJobItemFailure(
        item.id,
        failureMessage,
        promptText,
        job.creationMode === "prompt"
          ? promptModeInputs?.customNegativePrompt || job.customNegativePrompt
          : null,
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
