import type { UiLanguage } from "@/lib/types";
import { isGeminiImageSizeBucket, parseRatio, resolutionToPixels } from "@/lib/utils";

function ratioDelta(actualWidth: number, actualHeight: number, requestedRatio: string) {
  const actual = actualWidth / actualHeight;
  const [requestedWidth, requestedHeight] = parseRatio(requestedRatio);
  const requested = requestedWidth / requestedHeight;
  return Math.abs(actual - requested);
}

function minimumLongestSideForBucket(label: string) {
  if (!isGeminiImageSizeBucket(label)) {
    return 0;
  }

  const normalizedLabel = label === "512px" ? "0.5K" : label;
  const nominal = resolutionToPixels(normalizedLabel);

  if (normalizedLabel === "4K") {
    return 3072;
  }

  return Math.round(nominal * 0.85);
}

export function meetsRequestedResolutionBucket(input: {
  requestedResolutionLabel: string;
  actualWidth: number | null;
  actualHeight: number | null;
}) {
  if (!input.actualWidth || !input.actualHeight) {
    return true;
  }

  if (!isGeminiImageSizeBucket(input.requestedResolutionLabel)) {
    return true;
  }

  if (input.requestedResolutionLabel === "1K") {
    const shortestSide = Math.min(input.actualWidth, input.actualHeight);
    return shortestSide >= resolutionToPixels(input.requestedResolutionLabel);
  }

  const longestSide = Math.max(input.actualWidth, input.actualHeight);
  return longestSide >= minimumLongestSideForBucket(input.requestedResolutionLabel);
}

export function buildProviderDimensionWarning(input: {
  requestedRatio: string;
  requestedResolutionLabel: string;
  actualWidth: number | null;
  actualHeight: number | null;
  language?: UiLanguage;
}) {
  if (!input.actualWidth || !input.actualHeight) {
    return null;
  }

  const aspectMismatch = ratioDelta(input.actualWidth, input.actualHeight, input.requestedRatio) > 0.01;
  const resolutionMismatch = !meetsRequestedResolutionBucket({
    requestedResolutionLabel: input.requestedResolutionLabel,
    actualWidth: input.actualWidth,
    actualHeight: input.actualHeight,
  });

  if (!aspectMismatch && !resolutionMismatch) {
    return null;
  }

  const language = input.language ?? "en";
  const resolutionHint = isGeminiImageSizeBucket(input.requestedResolutionLabel)
    ? language === "zh"
      ? `${input.requestedResolutionLabel === "512px" ? "0.5K" : input.requestedResolutionLabel} 档位`
      : `${input.requestedResolutionLabel === "512px" ? "0.5K" : input.requestedResolutionLabel} bucket`
    : input.requestedResolutionLabel;

  if (aspectMismatch && resolutionMismatch) {
    return language === "zh"
      ? `请求比例 ${input.requestedRatio} / 请求尺寸档位 ${resolutionHint}，但实际返回 ${input.actualWidth}×${input.actualHeight}，比例与尺寸档位都未命中。`
      : `Requested ${input.requestedRatio} / ${resolutionHint}, but provider returned ${input.actualWidth}×${input.actualHeight} with a different aspect ratio and a lower-than-requested size bucket.`;
  }

  if (aspectMismatch) {
    return language === "zh"
      ? `请求比例 ${input.requestedRatio} / 请求尺寸档位 ${resolutionHint}，但实际返回 ${input.actualWidth}×${input.actualHeight}，比例未命中。`
      : `Requested ${input.requestedRatio} / ${resolutionHint}, but provider returned ${input.actualWidth}×${input.actualHeight} with a different aspect ratio.`;
  }

  return language === "zh"
    ? `请求尺寸档位 ${resolutionHint}，但实际返回 ${input.actualWidth}×${input.actualHeight}，尺寸明显低于所选档位。`
    : `Requested ${resolutionHint}, but provider returned ${input.actualWidth}×${input.actualHeight}, which is clearly below the selected size bucket.`;
}

export function formatRequestedSizeDisplay(input: {
  width: number | null | undefined;
  height: number | null | undefined;
  resolutionLabel: string;
  language: UiLanguage;
  emptyLabel: string;
}) {
  if (isGeminiImageSizeBucket(input.resolutionLabel)) {
    const normalizedLabel = input.resolutionLabel === "512px" ? "0.5K" : input.resolutionLabel;
    const bucketLabel = input.language === "zh" ? `${normalizedLabel} 档位` : `${normalizedLabel} bucket`;
    if (!input.width || !input.height) {
      return bucketLabel;
    }
    return `${bucketLabel} (${input.width}x${input.height})`;
  }

  if (!input.width || !input.height) {
    return input.emptyLabel;
  }

  return `${input.width}x${input.height}`;
}
