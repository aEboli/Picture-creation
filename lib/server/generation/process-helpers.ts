import "server-only";

import { syncJobToFeishu } from "@/lib/feishu";
import { getJobDetails, getJobItemStatusSummary, listJobItems, updateJobFeishuSyncState, updateJobStatus } from "@/lib/db";
import { buildProviderDimensionWarning } from "@/lib/image-size-policy";
import { isGeminiImageSizeBucket } from "@/lib/utils";
import type { AppSettings, ProviderDebugInfo, UiLanguage } from "@/lib/types";

function summarizePartialFailure(
  totalCount: number,
  successCount: number,
  failedDebugs: Array<ProviderDebugInfo | null>,
) {
  const failureCount = totalCount - successCount;
  const downloadFailures = failedDebugs.filter((debug) => debug?.failureStage === "provider-image-download").length;

  if (downloadFailures > 0) {
    return `${totalCount} variants requested: ${successCount} succeeded, ${failureCount} failed. ${downloadFailures} failed while downloading provider-returned image URLs.`;
  }

  return `${totalCount} variants requested: ${successCount} succeeded, ${failureCount} failed.`;
}

export function settleJobStatusFromItems(jobId: string) {
  const items = listJobItems(jobId);
  const summary = getJobItemStatusSummary(jobId);

  if (summary.total === 0) {
    updateJobStatus(jobId, "failed", "No job items were created.");
    return;
  }

  if (summary.queuedCount > 0) {
    updateJobStatus(jobId, "queued");
    return;
  }

  if (summary.processingCount > 0) {
    updateJobStatus(jobId, "processing");
    return;
  }

  if (summary.completedCount === summary.total) {
    updateJobStatus(jobId, "completed");
    return;
  }

  if (summary.completedCount > 0 && summary.failedCount > 0) {
    const failedDebugs = items
      .filter((item) => item.status === "failed")
      .map((item) => item.providerDebug ?? null);
    updateJobStatus(jobId, "partial", summarizePartialFailure(summary.total, summary.completedCount, failedDebugs));
    return;
  }

  const firstFailureMessage = items.find((item) => item.status === "failed")?.errorMessage ?? "All variants failed to generate.";
  updateJobStatus(jobId, "failed", firstFailureMessage);
}

export function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

export async function syncJobSummaryToFeishu(jobId: string, settings: AppSettings) {
  const details = getJobDetails(jobId);
  if (!details) {
    return;
  }

  const feishuState = await syncJobToFeishu({
    settings,
    details,
  });

  if (feishuState) {
    updateJobFeishuSyncState(jobId, feishuState.recordId, feishuState.fileTokens);
  }
}

import { isGemini3ImageModel } from "@/lib/image-model-limits";

export function shouldRetryForResolutionBucket(imageModel: string, resolutionLabel: string) {
  return isGemini3ImageModel(imageModel) && isGeminiImageSizeBucket(resolutionLabel);
}

export function withProviderDebugContext(error: unknown, fallbackMessage: string) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  const wrapped = new Error(message) as Error & {
    promptText?: string;
    providerDebug?: ProviderDebugInfo | null;
  };

  if (error && typeof error === "object") {
    if ("promptText" in error) {
      wrapped.promptText = String((error as { promptText?: string }).promptText ?? "");
    }
    if ("providerDebug" in error) {
      wrapped.providerDebug = (error as { providerDebug?: ProviderDebugInfo | null }).providerDebug ?? null;
    }
  }

  return wrapped;
}

export function buildJobItemDimensionWarning(input: {
  requestedRatio: string;
  requestedResolutionLabel: string;
  actualWidth: number | null;
  actualHeight: number | null;
  language: UiLanguage;
}) {
  return buildProviderDimensionWarning({
    requestedRatio: input.requestedRatio,
    requestedResolutionLabel: input.requestedResolutionLabel,
    actualWidth: input.actualWidth,
    actualHeight: input.actualHeight,
    language: input.language,
  });
}
