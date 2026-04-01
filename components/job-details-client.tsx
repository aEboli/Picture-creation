"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ImageLightbox, type ImageLightboxItem } from "@/components/image-lightbox";
import { buildAssetUrl } from "@/lib/asset-url";
import { ASPECT_RATIOS, IMAGE_TYPE_OPTIONS } from "@/lib/constants";
import { splitCompositeSourceDescription } from "@/lib/creative-fields";
import { buildGeneratedImageDownloadName, dedupeDownloadFilenames } from "@/lib/download-filenames";
import { formatRequestedSizeDisplay } from "@/lib/image-size-policy";
import type { JobDetails, JobItemReviewStatus, UiLanguage } from "@/lib/types";

type DetailTabId = "inputs" | "variants";

type DetailLightboxItem = ImageLightboxItem & {
  actionHref: string;
  itemId: string;
};

const VISIBLE_POLL_INTERVAL_MS = 5000;
const HIDDEN_POLL_INTERVAL_MS = 15000;

function isPollingStatus(status: string) {
  return status === "queued" || status === "processing";
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 20 20">
      <path
        d={direction === "left" ? "M11.75 4.5 6.25 10l5.5 5.5" : "M8.25 4.5 13.75 10l-5.5 5.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function getDefaultDetailTab(details: JobDetails): DetailTabId {
  if (details.job.localizedInputs) {
    return "inputs";
  }

  return "variants";
}

function statusText(language: UiLanguage, status: string) {
  const map = {
    zh: {
      queued: "排队中",
      processing: "生成中",
      completed: "已完成",
      partial: "部分完成",
      failed: "失败",
    },
    en: {
      queued: "Queued",
      processing: "Processing",
      completed: "Completed",
      partial: "Partial",
      failed: "Failed",
    },
  } as const;

  return map[language][status as keyof (typeof map)["zh"]] ?? status;
}

function reviewStatusText(language: UiLanguage, status: JobItemReviewStatus) {
  const map = {
    zh: {
      unreviewed: "待筛选",
      shortlisted: "已入选",
      approved: "已通过",
      rejected: "已淘汰",
    },
    en: {
      unreviewed: "Unreviewed",
      shortlisted: "Shortlisted",
      approved: "Approved",
      rejected: "Rejected",
    },
  } as const;

  return map[language][status];
}

function assetPreviewUrl(assetId: string) {
  return buildAssetUrl(assetId, { width: 1400, quality: 82 });
}

function assetThumbUrl(assetId: string) {
  return buildAssetUrl(assetId, { width: 320, quality: 72 });
}

function assetSidebarUrl(assetId: string) {
  return buildAssetUrl(assetId, { width: 256, quality: 70 });
}

function assetCompareUrl(assetId: string) {
  return buildAssetUrl(assetId, { width: 720, quality: 78 });
}

function assetGridUrl(assetId: string) {
  return buildAssetUrl(assetId, { width: 960, quality: 80 });
}

function assetOriginalUrl(assetId: string) {
  return buildAssetUrl(assetId);
}

function assetDownloadUrl(assetId: string, filename?: string) {
  return buildAssetUrl(assetId, { download: true, filename });
}

function approvedDownloadUrl(jobId: string) {
  return `/api/jobs/${jobId}/approved-download`;
}

function allImagesDownloadUrl(jobId: string, language: UiLanguage) {
  return `/api/jobs/${jobId}/all-images-download?language=${encodeURIComponent(language)}`;
}

function previewZoomAriaLabel(language: UiLanguage, label: string, index: number, total: number) {
  return language === "zh"
    ? `\u70b9\u51fb\u653e\u5927\u67e5\u770b ${label} \u7684\u7b2c ${index} / ${total} \u5f20\u56fe\u7247`
    : `Open zoom preview ${index} of ${total} for ${label}`;
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function formatDimensions(width: number | null | undefined, height: number | null | undefined, emptyLabel: string) {
  if (!width || !height) {
    return emptyLabel;
  }

  return `${width}x${height}`;
}

function formatRatio(width: number | null | undefined, height: number | null | undefined, emptyLabel: string) {
  if (!width || !height) {
    return emptyLabel;
  }

  const knownRatios = ASPECT_RATIOS.map((option) => {
    const [left, right] = option.value.split(":").map(Number);
    return {
      label: option.value,
      value: left / right,
    };
  });

  const actual = width / height;
  const matched = knownRatios.find((ratio) => Math.abs(ratio.value - actual) <= 0.03);
  if (matched) {
    return matched.label;
  }

  const gcd = (left: number, right: number): number => (right === 0 ? left : gcd(right, left % right));
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function formatSizeMb(sizeBytes: number | null | undefined, emptyLabel: string) {
  if (!sizeBytes || sizeBytes <= 0) {
    return emptyLabel;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

function imageTypeLabel(language: UiLanguage, imageType: string, creationMode?: JobDetails["job"]["creationMode"]) {
  if (creationMode === "reference-remix") {
    return language === "zh" ? "复刻图" : "Remake image";
  }

  return IMAGE_TYPE_OPTIONS.find((option) => option.value === imageType)?.label[language] ?? imageType;
}

export function JobDetailsClient({
  initialDetails,
  language,
  initialActiveItemId,
}: {
  initialDetails: JobDetails;
  language: UiLanguage;
  initialActiveItemId?: string | null;
}) {
  const router = useRouter();
  const [details, setDetails] = useState(initialDetails);
  const [errorMessage, setErrorMessage] = useState("");
  const [noticeMessage, setNoticeMessage] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [copiedFieldId, setCopiedFieldId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTabId>(() => getDefaultDetailTab(initialDetails));
  const [activeItemId, setActiveItemId] = useState<string | null>(
    () =>
      initialActiveItemId && initialDetails.items.some((item) => item.id === initialActiveItemId)
        ? initialActiveItemId
        : initialDetails.items.find((item) => item.generatedAsset)?.id ?? initialDetails.items[0]?.id ?? null,
  );
  const [isFeishuSyncing, setIsFeishuSyncing] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isDownloadingAllSequential, setIsDownloadingAllSequential] = useState(false);

  const jobDetailsRequestInFlightRef = useRef(false);
  const pendingRefreshRef = useRef(false);
  const latestJobIdRef = useRef(initialDetails.job.id);
  const latestJobStatusRef = useRef(initialDetails.job.status);

  useEffect(() => {
    latestJobIdRef.current = details.job.id;
    pendingRefreshRef.current = false;
  }, [details.job.id]);

  useEffect(() => {
    latestJobStatusRef.current = details.job.status;
  }, [details.job.status]);

  const refreshJobDetails = useCallback(async (): Promise<JobDetails | null> => {
    const jobId = latestJobIdRef.current;
    if (!jobId) {
      return null;
    }

    if (jobDetailsRequestInFlightRef.current) {
      pendingRefreshRef.current = true;
      return null;
    }

    jobDetailsRequestInFlightRef.current = true;
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as JobDetails;
      setDetails(body);
      return body;
    } finally {
      jobDetailsRequestInFlightRef.current = false;
      if (pendingRefreshRef.current) {
        pendingRefreshRef.current = false;
        await refreshJobDetails();
      }
    }
  }, [setDetails]);

  useEffect(() => {
    if (!isPollingStatus(details.job.status)) {
      return;
    }

    let active = true;
    let timeoutId: number | null = null;

    const clearTimer = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextPoll = () => {
      if (!active || !isPollingStatus(latestJobStatusRef.current)) {
        return;
      }

      clearTimer();

      const interval =
        document.visibilityState === "visible" ? VISIBLE_POLL_INTERVAL_MS : HIDDEN_POLL_INTERVAL_MS;

      timeoutId = window.setTimeout(async () => {
        await refreshJobDetails();
        scheduleNextPoll();
      }, interval);
    };

    const handleVisibilityChange = () => {
      if (!active) {
        return;
      }

      if (document.visibilityState === "visible") {
        void refreshJobDetails();
      }

      scheduleNextPoll();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void refreshJobDetails();
    scheduleNextPoll();

    return () => {
      active = false;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [details.job.id, details.job.status, refreshJobDetails]);

  useEffect(() => {
    if (!copiedFieldId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopiedFieldId(null);
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [copiedFieldId]);

  useEffect(() => {
    const fallbackActiveId =
      details.items.find((item) => item.generatedAsset)?.id ?? details.items[0]?.id ?? null;

    if (!fallbackActiveId) {
      if (activeItemId) {
        setActiveItemId(null);
      }
      return;
    }

    if (!activeItemId || !details.items.some((item) => item.id === activeItemId)) {
      setActiveItemId(fallbackActiveId);
    }
  }, [activeItemId, details.items]);

  const text = useMemo(
    () =>
      language === "zh"
        ? {
            "heading": "\u4efb\u52a1\u8be6\u60c5",
            "jobOverview": "\u4efb\u52a1\u603b\u89c8",
            "createdAt": "\u521b\u5efa\u65f6\u95f4",
            "translatedInfo": "\u539f\u59cb\u8f93\u5165 vs \u81ea\u52a8\u7ffb\u8bd1\u540e\u8f93\u5165",
            "translatedHint": "\u5de6\u4fa7\u662f\u4f60\u586b\u5199\u7684\u539f\u59cb\u57fa\u7840\u4fe1\u606f\uff0c\u53f3\u4fa7\u662f\u7cfb\u7edf\u5728\u751f\u6210\u524d\u81ea\u52a8\u7ffb\u8bd1\u6210\u5f53\u524d\u8f93\u51fa\u8bed\u8a00\u540e\u7684\u7248\u672c\uff0c\u6a21\u578b\u5b9e\u9645\u4f7f\u7528\u7684\u662f\u53f3\u4fa7\u5185\u5bb9\u3002",
            "inputSnapshot": "\u8f93\u5165\u5feb\u7167",
            "inputSnapshotHint": "\u540c\u4e00\u4e2a\u5b57\u6bb5\u540c\u65f6\u5bf9\u7167\u539f\u59cb\u8f93\u5165\u548c\u7cfb\u7edf\u751f\u6210\u524d\u5b9e\u9645\u4f7f\u7528\u7684\u7ffb\u8bd1\u540e\u7248\u672c\u3002",
            "originalInfo": "\u539f\u59cb\u8f93\u5165",
            "localizedInfo": "\u81ea\u52a8\u7ffb\u8bd1\u540e\u8f93\u5165",
            "translatedProductName": "图片名",
            "translatedSellingPoints": "\u6838\u5fc3\u5356\u70b9",
            "translatedRestrictions": "\u9650\u5236\u8bcd / \u7981\u7528\u5185\u5bb9",
            "translatedSourceDescription": "\u8865\u5145\u8bf4\u660e",
            "translatedMaterialInfo": "\u6750\u8d28",
            "translatedSizeInfo": "\u5c3a\u5bf8 / \u91cd\u91cf",
            "copy": "\u590d\u5236",
            "copied": "\u5df2\u590d\u5236",
            "sourceImages": "图片原图",
            "referenceImages": "\u53c2\u8003\u56fe",
            "creationMode": "\u751f\u6210\u6a21\u5f0f",
            "standardMode": "\u6807\u51c6\u51fa\u56fe",
            "promptMode": "\u63d0\u793a\u8bcd\u6a21\u5f0f",
            "promptTranslation": "\u63d0\u793a\u8bcd\u7ffb\u8bd1",
            "promptTranslationOn": "\u7ffb\u8bd1\u4e3a\u8f93\u51fa\u8bed\u8a00",
            "promptTranslationOff": "\u4fdd\u7559\u539f\u6587",
            "promptOptimization": "\u771f\u5b9e\u7167\u7247\u4f18\u5316",
            "promptOptimizationOn": "\u5df2\u5f00\u542f",
            "promptOptimizationOff": "\u672a\u5f00\u542f",
            "referenceMode": "\u53c2\u8003\u56fe\u590d\u523b",
            "referenceStrength": "\u590d\u523b\u5f3a\u5ea6",
            "strengthReference": "\u66f4\u50cf\u53c2\u8003\u56fe",
            "strengthBalanced": "\u5e73\u8861",
            "strengthProduct": "更像原图场景",
            "sourceAndReference": "\u539f\u56fe / \u53c2\u8003\u56fe",
            "previewWorkspace": "\u7ed3\u679c\u5de5\u4f5c\u53f0",
            "previewWorkspaceHint": "\u9009\u4e2d\u4e00\u4e2a\u751f\u6210\u9879\u540e\uff0c\u5728\u8fd9\u91cc\u805a\u7126\u67e5\u770b\u751f\u6210\u56fe\uff0c\u5e76\u5b8c\u6210\u5c3a\u5bf8\u3001Prompt \u548c\u5ba1\u6838\u64cd\u4f5c\u3002",
            "zoomHint": "\u70b9\u51fb\u56fe\u7247\u53ef\u653e\u5927\u67e5\u770b",
            "variantBrowser": "\u751f\u6210\u9879\u6d4f\u89c8",
            "noGeneratedImage": "\u6682\u65e0\u751f\u6210\u7eaf\u56fe",
            "noMedia": "\u6682\u65e0\u56fe\u7247",
            "noPreviewAvailable": "\u5f53\u524d\u751f\u6210\u9879\u8fd8\u6ca1\u6709\u53ef\u9884\u89c8\u7684\u7ed3\u679c\u3002",
            "variants": "\u53d8\u4f53\u7ed3\u679c",
            "generated": "\u7eaf\u56fe\u7247",
            "compare": "\u7ed3\u679c\u5bf9\u6bd4",
            "addCompare": "\u52a0\u5165\u5bf9\u6bd4",
            "removeCompare": "\u79fb\u51fa\u5bf9\u6bd4",
            "clearCompare": "\u6e05\u7a7a\u5bf9\u6bd4",
            "compareHint": "\u6700\u591a\u53ef\u540c\u65f6\u5bf9\u6bd4 4 \u4e2a\u7ed3\u679c\uff0c\u65b9\u4fbf\u66f4\u5feb\u9009\u51fa\u53ef\u7528\u56fe\u3002",
            "comparePickMore": "\u518d\u9009 1 \u5f20\u5373\u53ef\u8fdb\u5165\u5bf9\u6bd4\u89c6\u56fe\u3002",
            "shortlisted": "\u5165\u9009",
            "approved": "\u901a\u8fc7",
            "rejected": "\u6dd8\u6c70",
            "resetReview": "\u91cd\u7f6e",
            "prompt": "\u5b9e\u9645\u53d1\u9001\u7ed9\u6a21\u578b\u7684\u63d0\u793a\u8bcd",
            "directPrompt": "\u672c\u6b21\u5b9e\u9645\u53d1\u9001\u7ed9\u6a21\u578b\u7684\u76f4\u9a71\u590d\u523b prompt",
            "download": "\u4e0b\u8f7d",
            "downloadApproved": "\u6279\u91cf\u4e0b\u8f7d\u5df2\u901a\u8fc7\u56fe\u7247",
            "downloadAllSequential": "\u6309\u5e8f\u4e0b\u8f7d\u5168\u90e8\u56fe\u7247",
            "downloadAllSequentialPending": "\u6309\u5e8f\u4e0b\u8f7d\u4e2d...",
            "downloadAllZip": "\u538b\u7f29\u5305\u4e0b\u8f7d\u5168\u90e8\u56fe\u7247",
            "approvedSummary": "\u5df2\u901a\u8fc7 {count} \u7ec4\u7ed3\u679c\uff0c\u53ef\u4e00\u952e\u6253\u5305\u4e0b\u8f7d\u3002",
            "allImagesSummary": "\u5168\u90e8\u6210\u529f\u56fe\u7247 {count} \u5f20\uff0c\u53ef\u6309\u5e8f\u4e0b\u8f7d\u6216\u6253\u5305\u4e0b\u8f7d\u3002",
            "noSuccessfulImages": "\u5f53\u524d\u8fd8\u6ca1\u6709\u6210\u529f\u751f\u6210\u7684\u56fe\u7247\u3002",
            "noApproved": "\u8fd8\u6ca1\u6709\u5df2\u901a\u8fc7\u7ed3\u679c\uff0c\u5148\u6311\u51fa\u4f60\u60f3\u4fdd\u7559\u7684\u56fe\u7247\u3002",
            "rerun": "\u518d\u6b21\u751f\u6210",
            "rerunFromStrategy": "\u57fa\u4e8e\u7b56\u7565\u91cd\u751f",
            "resyncFeishu": "\u91cd\u65b0\u540c\u6b65\u98de\u4e66",
            "resyncingFeishu": "\u540c\u6b65\u4e2d...",
            "resyncFeishuSuccess": "\u98de\u4e66\u5df2\u91cd\u65b0\u540c\u6b65\uff0c\u6210\u529f\u56de\u5199 {uploaded} \u5f20\u56fe\uff0c\u5931\u8d25 {failed} \u5f20\u3002",
            "resyncFeishuError": "\u98de\u4e66\u91cd\u540c\u6b65\u5931\u8d25",
            "retryError": "\u91cd\u8bd5\u5931\u8d25",
            "jobError": "\u4efb\u52a1\u5931\u8d25\u539f\u56e0",
            "summary": "\u6458\u8981",
            "marketingStrategy": "\u603b\u8425\u9500\u7b56\u7565",
            "marketingStrategyRaw": "\u603b\u7b56\u7565 JSON",
            "imageStrategy": "\u5355\u56fe\u7b56\u7565",
            "imageStrategyRaw": "\u5355\u56fe\u7b56\u7565 JSON",
            "strategyBadge": "\u7b56\u7565",
            "targetAudience": "\u76ee\u6807\u4eba\u7fa4",
            "conversionGoal": "\u8f6c\u5316\u76ee\u6807",
            "prioritizedSellingPoints": "\u5356\u70b9\u4f18\u5148\u7ea7",
            "avoidDirections": "\u4e0d\u5efa\u8bae\u65b9\u5411",
            "marketingRole": "\u8425\u9500\u804c\u8d23",
            "primarySellingPoint": "\u4e3b\u6253\u5356\u70b9",
            "sceneType": "\u573a\u666f\u7c7b\u578b",
            "compositionGuidance": "\u6784\u56fe\u5efa\u8bae",
            "copySpaceGuidance": "\u6587\u6848\u7559\u767d",
            "moodLighting": "\u60c5\u7eea\u4e0e\u5149\u7ebf",
            "whyNeeded": "\u8fd9\u5f20\u56fe\u7684\u5fc5\u8981\u6027",
            "strategyRerunError": "\u57fa\u4e8e\u7b56\u7565\u91cd\u751f\u5931\u8d25",
            "palette": "\u914d\u8272",
            "backgroundType": "\u80cc\u666f\u7c7b\u578b",
            "primaryPlacement": "\u4e3b\u5546\u54c1\u4f4d\u7f6e",
            "packagingPlacement": "\u5305\u88c5\u4f4d\u7f6e",
            "packagingRelationship": "\u5546\u54c1\u4e0e\u5305\u88c5\u5173\u7cfb",
            "camera": "\u955c\u5934\u89d2\u5ea6",
            "lighting": "\u5149\u7ebf\u4e0e\u666f\u6df1",
            "props": "\u8f85\u52a9\u5143\u7d20",
            "topBanner": "\u9876\u90e8\u6a2a\u5e45",
            "headline": "\u4e3b\u6807\u9898",
            "subheadline": "\u526f\u6807\u9898",
            "bottomBanner": "\u5e95\u90e8\u6a2a\u5e45",
            "callouts": "\u89d2\u6807 / \u5356\u70b9\u77ed\u53e5",
            "empty": "\u65e0",
            "unknown": "\u672a\u77e5",
            "separator": " \u00b7 ",
            "variantSummary": "{total} \u4e2a\u751f\u6210\u9879\u4e2d {success} \u4e2a\u6210\u529f\uff0c{failed} \u4e2a\u5931\u8d25\u3002",
            "providerRequestSummary": "{count} \u4e2a\u5931\u8d25\u9879\u53d1\u751f\u5728\u8bf7\u6c42\u4e2d\u8f6c / \u6a21\u578b\u63a5\u53e3\u9636\u6bb5\u3002",
            "providerDownloadSummary": "{count} \u4e2a\u5931\u8d25\u9879\u53d1\u751f\u5728\u4e0b\u8f7d\u4e2d\u8f6c\u8fd4\u56de\u56fe\u7247\u65f6\u3002",
            "warningSummary": "{count} \u4e2a\u6210\u529f\u9879\u7684\u5b9e\u9645\u5c3a\u5bf8\u4e0e\u8bf7\u6c42\u4e0d\u4e00\u81f4\u3002",
            "requestSize": "\u8bf7\u6c42\u5c3a\u5bf8\u6863\u4f4d",
            "actualSize": "\u5b9e\u9645\u5c3a\u5bf8",
            "requestRatio": "\u8bf7\u6c42\u6bd4\u4f8b",
            "actualRatio": "\u5b9e\u9645\u6bd4\u4f8b",
            "actualFileSize": "\u5b9e\u9645\u8fd4\u56de\u5927\u5c0f",
            "warning": "\u5c3a\u5bf8\u8b66\u544a",
            "providerImageUrl": "\u4e2d\u8f6c\u8fd4\u56de\u56fe\u7247 URL",
            "openLink": "\u6253\u5f00\u94fe\u63a5",
            "rawProviderResponse": "\u4e2d\u8f6c\u539f\u59cb\u8fd4\u56de",
            "failureReason": "\u5931\u8d25\u8be6\u60c5",
            "failureStage": "\u5931\u8d25\u9636\u6bb5",
            "failureStageProviderRequest": "\u8bf7\u6c42\u4e2d\u8f6c / \u6a21\u578b\u63a5\u53e3",
            "failureStageProviderDownload": "\u4e0b\u8f7d\u4e2d\u8f6c\u8fd4\u56de\u56fe\u7247",
            "failureStageResponse": "\u6a21\u578b\u54cd\u5e94 / \u62d2\u7edd"
}
        : {
            "heading": "Job details",
            "jobOverview": "Overview",
            "createdAt": "Created",
            "translatedInfo": "Original vs translated inputs",
            "translatedHint": "The left side shows your original base inputs. The right side shows the auto-translated version in the current output language that the model actually used.",
            "inputSnapshot": "Input snapshot",
            "inputSnapshotHint": "Each field shows both your original input and the translated version the system actually used during generation.",
            "originalInfo": "Original input",
            "localizedInfo": "Auto-translated input",
            "translatedProductName": "Image name",
            "translatedSellingPoints": "Selling points",
            "translatedRestrictions": "Restrictions / banned content",
            "translatedSourceDescription": "Additional notes",
            "translatedMaterialInfo": "Material",
            "translatedSizeInfo": "Size / weight",
            "copy": "Copy",
            "copied": "Copied",
            "sourceImages": "Source images",
            "referenceImages": "Reference images",
            "creationMode": "Creation mode",
            "standardMode": "Standard",
            "promptMode": "Prompt mode",
            "promptTranslation": "Prompt translation",
            "promptTranslationOn": "Translate to output language",
            "promptTranslationOff": "Keep original wording",
            "promptOptimization": "Real-photo optimization",
            "promptOptimizationOn": "Enabled",
            "promptOptimizationOff": "Disabled",
            "referenceMode": "Reference remake",
            "referenceStrength": "Remake strength",
            "strengthReference": "Closer to reference",
            "strengthBalanced": "Balanced",
            "strengthProduct": "Closer to source scene",
            "sourceAndReference": "Source / reference media",
            "previewWorkspace": "Review workspace",
            "previewWorkspaceHint": "Pick a variant and focus on the generated image, metadata, prompt, and review actions in one place.",
            "zoomHint": "Click the image to zoom in.",
            "variantBrowser": "Variant browser",
            "noGeneratedImage": "No generated image yet",
            "noMedia": "No images",
            "noPreviewAvailable": "This variant does not have any previewable output yet.",
            "variants": "Variants",
            "generated": "Pure image",
            "compare": "Compare results",
            "addCompare": "Add to compare",
            "removeCompare": "Remove",
            "clearCompare": "Clear compare",
            "compareHint": "Compare up to 4 outputs at once and pick the best candidate faster.",
            "comparePickMore": "Pick one more result to enter compare view.",
            "shortlisted": "Shortlist",
            "approved": "Approve",
            "rejected": "Reject",
            "resetReview": "Reset",
            "prompt": "Prompt sent to the model",
            "directPrompt": "Direct remake prompt sent to the model",
            "download": "Download",
            "downloadApproved": "Download approved ZIP",
            "downloadAllSequential": "Download all in order",
            "downloadAllSequentialPending": "Downloading...",
            "downloadAllZip": "Download all ZIP",
            "approvedSummary": "{count} approved variants are ready for batch download.",
            "allImagesSummary": "{count} successful generated images are ready for sequential or ZIP download.",
            "noSuccessfulImages": "There are no successfully generated images yet.",
            "noApproved": "No approved variants yet. Mark a few results first.",
            "rerun": "Run again",
            "rerunFromStrategy": "Rerun from strategy",
            "resyncFeishu": "Resync Feishu",
            "resyncingFeishu": "Syncing...",
            "resyncFeishuSuccess": "Feishu resynced. Uploaded {uploaded} image(s), failed {failed}.",
            "resyncFeishuError": "Feishu resync failed",
            "retryError": "Retry failed",
            "jobError": "Job failure reason",
            "summary": "Summary",
            "marketingStrategy": "Marketing strategy",
            "marketingStrategyRaw": "Marketing strategy JSON",
            "imageStrategy": "Image strategy",
            "imageStrategyRaw": "Image strategy JSON",
            "strategyBadge": "Strategy",
            "targetAudience": "Target audience",
            "conversionGoal": "Conversion goal",
            "prioritizedSellingPoints": "Prioritized selling points",
            "avoidDirections": "Avoid directions",
            "marketingRole": "Marketing role",
            "primarySellingPoint": "Primary selling point",
            "sceneType": "Scene type",
            "compositionGuidance": "Composition guidance",
            "copySpaceGuidance": "Copy-space guidance",
            "moodLighting": "Mood and lighting",
            "whyNeeded": "Why this image exists",
            "strategyRerunError": "Strategy rerun failed",
            "palette": "Palette",
            "backgroundType": "Background type",
            "primaryPlacement": "Primary product placement",
            "packagingPlacement": "Packaging placement",
            "packagingRelationship": "Product / packaging relationship",
            "camera": "Camera angle",
            "lighting": "Lighting and depth",
            "props": "Supporting props",
            "topBanner": "Top banner",
            "headline": "Headline",
            "subheadline": "Subheadline",
            "bottomBanner": "Bottom banner",
            "callouts": "Callouts",
            "empty": "None",
            "unknown": "Unknown",
            "separator": " \u00b7 ",
            "variantSummary": "{total} variants requested: {success} succeeded, {failed} failed.",
            "providerRequestSummary": "{count} failed before the relay/model request returned a response.",
            "providerDownloadSummary": "{count} failed while downloading provider-returned image URLs.",
            "warningSummary": "{count} successful variants returned a different size than requested.",
            "requestSize": "Requested size bucket",
            "actualSize": "Actual size",
            "requestRatio": "Requested ratio",
            "actualRatio": "Actual ratio",
            "actualFileSize": "Actual file size",
            "warning": "Size warning",
            "providerImageUrl": "Provider image URL",
            "openLink": "Open link",
            "rawProviderResponse": "Raw provider response",
            "failureReason": "Failure details",
            "failureStage": "Failure stage",
            "failureStageProviderRequest": "Relay / provider request",
            "failureStageProviderDownload": "Download returned image",
            "failureStageResponse": "Model response / refusal"
},
    [language],
  );

  const originalCreativeFields = splitCompositeSourceDescription(details.job.sourceDescription);
  const localizedCreativeFields = {
    sourceDescription: details.job.localizedInputs?.sourceDescription ?? "",
    materialInfo: details.job.localizedInputs?.materialInfo ?? "",
    sizeInfo: details.job.localizedInputs?.sizeInfo ?? "",
  };

  const detailRows = details.job.localizedInputs
    ? [
        {
          key: "productName",
          label: text.translatedProductName,
          originalValue: details.job.productName,
          localizedValue: details.job.localizedInputs.productName,
        },
        {
          key: "sellingPoints",
          label: text.translatedSellingPoints,
          originalValue: details.job.sellingPoints,
          localizedValue: details.job.localizedInputs.sellingPoints,
        },
        {
          key: "restrictions",
          label: text.translatedRestrictions,
          originalValue: details.job.restrictions,
          localizedValue: details.job.localizedInputs.restrictions,
        },
        {
          key: "sourceDescription",
          label: text.translatedSourceDescription,
          originalValue: originalCreativeFields.sourceDescription,
          localizedValue: localizedCreativeFields.sourceDescription,
        },
        {
          key: "materialInfo",
          label: text.translatedMaterialInfo,
          originalValue: originalCreativeFields.materialInfo,
          localizedValue: localizedCreativeFields.materialInfo,
        },
        {
          key: "sizeInfo",
          label: text.translatedSizeInfo,
          originalValue: originalCreativeFields.sizeInfo,
          localizedValue: localizedCreativeFields.sizeInfo,
        },
      ].filter((row) => Boolean(row.originalValue.trim()) || Boolean(row.localizedValue.trim()))
    : [];
  const hasInputSnapshot = detailRows.length > 0;
  const detailTabs = [
    hasInputSnapshot
      ? { id: "inputs" as const, label: language === "zh" ? "输入快照" : "Inputs" }
      : null,
    { id: "variants" as const, label: language === "zh" ? "变体归档" : "Variant archive" },
  ].filter(Boolean) as Array<{ id: DetailTabId; label: string }>;

  const comparableItems = details.items.filter((item) => item.generatedAsset);
  const lightboxItems = useMemo<DetailLightboxItem[]>(
    () =>
      comparableItems.map((item) => ({
        actionHref: assetOriginalUrl(item.generatedAsset!.id),
        alt: item.generatedAsset?.originalName || item.id,
        itemId: item.id,
        label: previewZoomAriaLabel(language, details.job.productName, item.variantIndex, comparableItems.length),
        src: assetOriginalUrl(item.generatedAsset!.id),
      })),
    [comparableItems, details.job.productName, language],
  );
  const comparedItems = comparableItems.filter((item) => compareIds.includes(item.id));
  const approvedItems = details.items.filter((item) => item.reviewStatus === "approved" && item.generatedAsset);
  const successfulItems = details.items.filter((item) => item.generatedAsset);
  const successfulDownloadQueue = dedupeDownloadFilenames(
    successfulItems.map((item) =>
      buildGeneratedImageDownloadName({
        sourceAssetName: item.sourceAssetName && item.sourceAssetName !== "prompt-only" ? item.sourceAssetName : details.job.productName,
        imageType: item.imageType,
        creationMode: details.job.creationMode,
        resolutionLabel: item.resolutionLabel,
        ratio: item.ratio,
        mimeType: item.generatedAsset!.mimeType,
        language,
      }),
    ),
  );
  const approvedSummaryText =
    approvedItems.length > 0
      ? text.approvedSummary.replace("{count}", String(approvedItems.length))
      : text.noApproved;
  const allImagesSummaryText =
    successfulItems.length > 0
      ? text.allImagesSummary.replace("{count}", String(successfulItems.length))
      : text.noSuccessfulImages;
  const actualPromptLabel = details.job.creationMode === "reference-remix" ? text.directPrompt : text.prompt;
  const creationModeLabel =
    details.job.creationMode === "reference-remix"
      ? text.referenceMode
      : details.job.creationMode === "amazon-a-plus"
        ? details.job.uiLanguage === "zh"
          ? "亚马逊A+图"
          : "Amazon A+"
      : details.job.creationMode === "suite"
        ? details.job.uiLanguage === "zh"
          ? "套图模式"
          : "Image set mode"
      : details.job.creationMode === "prompt"
        ? text.promptMode
        : text.standardMode;
  const promptTranslationLabel =
    details.job.translatePromptToOutputLanguage === false
      ? text.promptTranslationOff
      : text.promptTranslationOn;
  const promptOptimizationLabel = details.job.autoOptimizePrompt
    ? text.promptOptimizationOn
    : text.promptOptimizationOff;
  const getDimensionWarning = (item: (typeof details.items)[number]) => {
    if (item.warningMessage) {
      return item.warningMessage;
    }

    if (!item.generatedAsset?.width || !item.generatedAsset?.height) {
      return null;
    }

    if (item.generatedAsset.width === item.width && item.generatedAsset.height === item.height) {
      return null;
    }

    return `${text.requestSize}: ${formatDimensions(item.width, item.height, text.unknown)} / ${text.requestRatio}: ${
      item.ratio
    }. ${text.actualSize}: ${formatDimensions(item.generatedAsset.width, item.generatedAsset.height, text.unknown)} / ${
      text.actualRatio
    }: ${formatRatio(item.generatedAsset.width, item.generatedAsset.height, text.unknown)}.`;
  };
  const succeededCount = details.items.filter((item) => item.generatedAsset).length;
  const failedItems = details.items.filter((item) => item.status === "failed");
  const providerRequestFailures = failedItems.filter((item) => item.providerDebug?.failureStage === "provider-request").length;
  const providerDownloadFailures = failedItems.filter(
    (item) => item.providerDebug?.failureStage === "provider-image-download",
  ).length;
  const warningCount = details.items.filter((item) => Boolean(getDimensionWarning(item))).length;
  const variantSummaryText = text.variantSummary
    .replace("{total}", String(details.items.length))
    .replace("{success}", String(succeededCount))
    .replace("{failed}", String(failedItems.length));
  const providerDownloadSummaryText =
    providerDownloadFailures > 0
      ? text.providerDownloadSummary.replace("{count}", String(providerDownloadFailures))
      : "";
  const providerRequestSummaryText =
    providerRequestFailures > 0
      ? text.providerRequestSummary.replace("{count}", String(providerRequestFailures))
      : "";
  const warningSummaryText =
    warningCount > 0 ? text.warningSummary.replace("{count}", String(warningCount)) : "";
  const createdAtLabel = new Date(details.job.createdAt).toLocaleString(language === "zh" ? "zh-CN" : "en-US");
  const activeItem = details.items.find((item) => item.id === activeItemId) ?? details.items[0] ?? null;
  const activePreviewAsset = activeItem?.generatedAsset ?? null;
  const activeDimensionWarning = activeItem ? getDimensionWarning(activeItem) : null;
  const activeItemIndex = activeItem ? details.items.findIndex((item) => item.id === activeItem.id) : -1;
  const activeItemNodeName = String(Math.max(activeItemIndex, 0) + 1);
  const activeLightboxIndex = lightboxItems.findIndex((item) => item.itemId === activeItemId);
  const activeLightboxItem = activeLightboxIndex >= 0 ? lightboxItems[activeLightboxIndex] : null;
  const showCopySummaryCards = details.job.creationMode === "prompt" || details.job.creationMode === "reference-remix";
  const canSelectPreviousItem = activeItemIndex > 0;
  const canSelectNextItem = activeItemIndex >= 0 && activeItemIndex < details.items.length - 1;
  const previousItemLabel = language === "zh" ? "上一项" : "Previous";
  const nextItemLabel = language === "zh" ? "下一项" : "Next";
  const previousImageLabel = language === "zh" ? "上一张图" : "Previous image";
  const nextImageLabel = language === "zh" ? "下一张图" : "Next image";
  const lightboxActionLabel = language === "zh" ? "查看原图" : "View original";
  const currentFocusLabel = language === "zh" ? "当前查看" : "Current focus";
  const currentFocusSummary =
    activeItemIndex >= 0
      ? language === "zh"
        ? `当前查看 ${activeItemIndex + 1} / ${details.items.length}`
        : `Viewing ${activeItemIndex + 1} / ${details.items.length}`
      : language === "zh"
        ? "暂无可查看项"
        : "No active item";
  const currentFocusMeta = activeItem
    ? `${imageTypeLabel(language, activeItem.imageType, details.job.creationMode)}${text.separator}${activeItem.ratio}${text.separator}${activeItem.resolutionLabel}${text.separator}#${activeItem.variantIndex}`
    : language === "zh"
      ? "未选择生成项"
      : "No variant selected";
  const comparedSummary =
    comparedItems.length > 0
      ? language === "zh"
        ? `已加入对比 ${comparedItems.length} 项`
        : `${comparedItems.length} item(s) in compare`
      : "";
  const getFailureStageLabel = (failureStage?: string | null) => {
    if (failureStage === "provider-request") {
      return text.failureStageProviderRequest;
    }
    if (failureStage === "provider-image-download") {
      return text.failureStageProviderDownload;
    }
    if (failureStage === "response") {
      return text.failureStageResponse;
    }
    return null;
  };

  useEffect(() => {
    if (detailTabs.some((tab) => tab.id === activeDetailTab)) {
      return;
    }

    setActiveDetailTab(detailTabs[0]?.id ?? "variants");
  }, [activeDetailTab, detailTabs]);

  useEffect(() => {
    if (!activeItemId) {
      return;
    }

    const activeCard = document.querySelector<HTMLElement>(`[data-variant-card-id="${activeItemId}"]`);
    if (!activeCard) {
      return;
    }

    const strip = activeCard.closest<HTMLElement>(".job-workbench-browser-strip");
    if (!strip) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const nextLeft = activeCard.offsetLeft;
      const nextRight = nextLeft + activeCard.offsetWidth;
      const currentLeft = strip.scrollLeft;
      const currentRight = currentLeft + strip.clientWidth;
      const padding = 16;

      if (nextLeft < currentLeft + padding) {
        strip.scrollTo({
          left: Math.max(nextLeft - padding, 0),
          behavior: "smooth",
        });
        return;
      }

      if (nextRight > currentRight - padding) {
        strip.scrollTo({
          left: Math.max(nextRight - strip.clientWidth + padding, 0),
          behavior: "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeItemId]);

  useEffect(() => {
    if (isLightboxOpen && activeLightboxIndex < 0) {
      setIsLightboxOpen(false);
    }
  }, [activeLightboxIndex, isLightboxOpen]);

  async function handleCopy(fieldId: string, value: string) {
    try {
      await copyToClipboard(value || "-");
      setCopiedFieldId(fieldId);
    } catch {
      setErrorMessage(text.retryError);
    }
  }

  async function handleRetry() {
    setErrorMessage("");
    setNoticeMessage("");
    const response = await fetch(`/api/jobs/${details.job.id}/retry`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(text.retryError);
      return;
    }
    const body = (await response.json()) as { jobId: string };
    router.push(`/jobs/${body.jobId}`);
  }

  async function handleFeishuResync() {
    setErrorMessage("");
    setNoticeMessage("");
    setIsFeishuSyncing(true);

    try {
      const response = await fetch(`/api/jobs/${details.job.id}/feishu-sync`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; uploadedCount?: number; failedCount?: number; details?: JobDetails }
        | null;

      if (!response.ok) {
        setErrorMessage(body?.error || text.resyncFeishuError);
        return;
      }

      if (body?.details) {
        setDetails(body.details);
      } else {
        const refreshed = await refreshJobDetails();
        if (!refreshed) {
          router.refresh();
        }
      }

      setNoticeMessage(
        text.resyncFeishuSuccess
          .replace("{uploaded}", String(body?.uploadedCount ?? 0))
          .replace("{failed}", String(body?.failedCount ?? 0)),
      );
    } catch {
      setErrorMessage(text.resyncFeishuError);
    } finally {
      setIsFeishuSyncing(false);
    }
  }

  async function handleDownloadAllSequential() {
    if (!successfulItems.length || isDownloadingAllSequential) {
      return;
    }

    setErrorMessage("");
    setNoticeMessage("");
    setIsDownloadingAllSequential(true);

    try {
      for (const [index, item] of successfulItems.entries()) {
        const generatedAsset = item.generatedAsset;
        if (!generatedAsset) {
          continue;
        }

        const anchor = document.createElement("a");
        anchor.href = assetDownloadUrl(generatedAsset.id, successfulDownloadQueue[index]);
        anchor.download = successfulDownloadQueue[index];
        anchor.rel = "noreferrer";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        await new Promise((resolve) => window.setTimeout(resolve, 180));
      }
    } catch {
      setErrorMessage(language === "zh" ? "顺序下载失败" : "Sequential download failed");
    } finally {
      setIsDownloadingAllSequential(false);
    }
  }

  async function handleReviewUpdate(itemId: string, reviewStatus: JobItemReviewStatus) {
    const response = await fetch(`/api/job-items/${itemId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewStatus }),
    });

    if (!response.ok) {
      return;
    }

    const updatedItem = (await response.json()) as { id: string; reviewStatus: JobItemReviewStatus };
    setDetails((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === updatedItem.id ? { ...item, reviewStatus: updatedItem.reviewStatus } : item,
      ),
    }));
    void refreshJobDetails();
  }

  function toggleCompare(itemId: string) {
    setCompareIds((current) => {
      if (current.includes(itemId)) {
        return current.filter((id) => id !== itemId);
      }
      if (current.length >= 4) {
        return current;
      }
      return [...current, itemId];
    });
  }

  function selectPreviousItem() {
    if (!canSelectPreviousItem) {
      return;
    }

    setActiveItemId(details.items[activeItemIndex - 1]?.id ?? null);
  }

  function selectNextItem() {
    if (!canSelectNextItem) {
      return;
    }

    setActiveItemId(details.items[activeItemIndex + 1]?.id ?? null);
  }

  function selectLightboxItem(nextIndex: number) {
    const nextItem = lightboxItems[nextIndex];
    if (!nextItem) {
      return;
    }

    setActiveItemId(nextItem.itemId);
  }

  function openLightbox(itemId: string) {
    if (!lightboxItems.some((item) => item.itemId === itemId)) {
      return;
    }

    setActiveItemId(itemId);
    setIsLightboxOpen(true);
  }

  function handleLightboxKeyDown(event: React.KeyboardEvent<HTMLImageElement>, itemId: string) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    openLightbox(itemId);
  }

  return (
    <div className="stack gap-24">
      <section className="panel split-header">
        <div>
          <p className="eyebrow">{text.heading}</p>
          <h2>{details.job.productName}</h2>
          <p className="helper">
            {details.job.platform}
            {text.separator}
            {details.job.language}
            {text.separator}
            {statusText(language, details.job.status)}
          </p>
          <p className="helper">
            {text.creationMode}
            {text.separator}
            {creationModeLabel}
          </p>
          {details.job.creationMode === "prompt" ? (
            <>
              <p className="helper">
                {text.promptTranslation}
                {text.separator}
                {promptTranslationLabel}
              </p>
              <p className="helper">
                {text.promptOptimization}
                {text.separator}
                {promptOptimizationLabel}
              </p>
            </>
          ) : null}
          <p className="helper">{variantSummaryText}</p>
          {providerRequestSummaryText ? <p className="helper">{providerRequestSummaryText}</p> : null}
          {providerDownloadSummaryText ? <p className="helper">{providerDownloadSummaryText}</p> : null}
          {warningSummaryText ? <p className="helper warning-text">{warningSummaryText}</p> : null}
          <p className="helper">{allImagesSummaryText}</p>
          <p className="helper">{approvedSummaryText}</p>
        </div>
        <div className="button-row header-actions">
          {successfulItems.length ? (
            <button className="ghost-button" disabled={isDownloadingAllSequential} onClick={handleDownloadAllSequential} type="button">
              {isDownloadingAllSequential ? text.downloadAllSequentialPending : text.downloadAllSequential}
            </button>
          ) : (
            <button className="ghost-button" disabled type="button">
              {text.downloadAllSequential}
            </button>
          )}
          {successfulItems.length ? (
            <a className="ghost-button" href={allImagesDownloadUrl(details.job.id, language)}>
              {text.downloadAllZip}
            </a>
          ) : (
            <button className="ghost-button" disabled type="button">
              {text.downloadAllZip}
            </button>
          )}
          {approvedItems.length ? (
            <a className="ghost-button" href={approvedDownloadUrl(details.job.id)}>
              {text.downloadApproved}
            </a>
          ) : (
            <button className="ghost-button" disabled type="button">
              {text.downloadApproved}
            </button>
          )}
          <button className="ghost-button" disabled={isFeishuSyncing} onClick={handleFeishuResync} type="button">
            {isFeishuSyncing ? text.resyncingFeishu : text.resyncFeishu}
          </button>
          <button className="ghost-button" onClick={handleRetry} type="button">
            {text.rerun}
          </button>
        </div>
      </section>

      {details.job.errorMessage ? (
        <section className="panel">
          <h3>{text.jobError}</h3>
          <p className="error-text">{details.job.errorMessage}</p>
        </section>
      ) : null}

      {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
      {noticeMessage ? <p className="success-text">{noticeMessage}</p> : null}

      <div className="job-details-workspace">
        <aside className="job-details-sidebar">
          <section className="panel">
            <div className="split-header compact">
              <div>
                <h3>{text.sourceAndReference}</h3>
              </div>
            </div>
            <div className="sidebar-media-stack">
              <div className="sidebar-media-group">
                <div className="detail-compare-heading">
                  <h4>{text.sourceImages}</h4>
                  <span className="helper">{details.sourceAssets.length}</span>
                </div>
                {details.sourceAssets.length ? (
                  <div className="sidebar-asset-grid">
                    {details.sourceAssets.map((asset) => (
                      <a
                        className="sidebar-asset-card"
                        href={assetOriginalUrl(asset.id)}
                        key={asset.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <img alt={asset.originalName} decoding="async" loading="lazy" src={assetSidebarUrl(asset.id)} />
                        <span>{asset.originalName}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="helper">{text.noMedia}</p>
                )}
              </div>

              {details.referenceAssets.length ? (
                <div className="sidebar-media-group">
                  <div className="detail-compare-heading">
                    <h4>{text.referenceImages}</h4>
                    <span className="helper">{details.referenceAssets.length}</span>
                  </div>
                  <div className="sidebar-asset-grid">
                    {details.referenceAssets.map((asset) => (
                      <a
                        className="sidebar-asset-card"
                        href={assetOriginalUrl(asset.id)}
                        key={asset.id}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <img alt={asset.originalName} decoding="async" loading="lazy" src={assetSidebarUrl(asset.id)} />
                        <span>{asset.originalName}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {detailRows.length ? (
            <section className="panel">
              <div className="split-header compact">
                <div>
                  <h3>{text.inputSnapshot}</h3>
                </div>
              </div>
              <div className="input-snapshot-list">
                {detailRows.map((row) => {
                  const originalFieldId = `workspace-original-${row.key}`;
                  const localizedFieldId = `workspace-localized-${row.key}`;

                  return (
                    <article className="input-snapshot-card" key={row.key}>
                      <strong>{row.label}</strong>
                      <div className="input-snapshot-columns">
                        <div className="input-snapshot-column">
                          <div className="detail-kv-head">
                            <span className="helper">{text.originalInfo}</span>
                            <button
                              className={`copy-chip-button${copiedFieldId === originalFieldId ? " is-copied" : ""}`}
                              onClick={() => handleCopy(originalFieldId, row.originalValue)}
                              type="button"
                            >
                              {copiedFieldId === originalFieldId ? text.copied : text.copy}
                            </button>
                          </div>
                          <p>{row.originalValue || "-"}</p>
                        </div>
                        <div className="input-snapshot-column">
                          <div className="detail-kv-head">
                            <span className="helper">{text.localizedInfo}</span>
                            <button
                              className={`copy-chip-button${copiedFieldId === localizedFieldId ? " is-copied" : ""}`}
                              onClick={() => handleCopy(localizedFieldId, row.localizedValue)}
                              type="button"
                            >
                              {copiedFieldId === localizedFieldId ? text.copied : text.copy}
                            </button>
                          </div>
                          <p>{row.localizedValue || "-"}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </aside>

        <div className="job-details-main">
          <section className="panel job-details-legacy-browser" hidden>
            <div className="split-header compact">
              <div>
                <h3>{text.variantBrowser}</h3>
              </div>
            </div>
            <div className="variant-browser-toolbar">
              <div className="variant-browser-focus">
                <span className="helper variant-browser-focus-label">{currentFocusLabel}</span>
                <strong>{currentFocusSummary}</strong>
                <p className="helper">{currentFocusMeta}</p>
              </div>
              <div className="variant-browser-toolbar-actions">
                {comparedSummary ? <span className="variant-browser-summary-chip">{comparedSummary}</span> : null}
                {comparedItems.length ? (
                  <button className="ghost-button mini-button" onClick={() => setCompareIds([])} type="button">
                    {text.clearCompare}
                  </button>
                ) : null}
                <div className="variant-browser-nav">
                  <button className="ghost-button mini-button" disabled={!canSelectPreviousItem} onClick={selectPreviousItem} type="button">
                    {previousItemLabel}
                  </button>
                  <button className="ghost-button mini-button" disabled={!canSelectNextItem} onClick={selectNextItem} type="button">
                    {nextItemLabel}
                  </button>
                </div>
              </div>
            </div>
            <div className="variant-browser-grid" role="listbox">
              {details.items.map((item) => {
                const previewAsset = item.generatedAsset;
                const isActive = item.id === activeItem?.id;
                const isCompared = compareIds.includes(item.id);

                return (
                  <button
                    aria-selected={isActive}
                    className={isActive ? "variant-browser-card is-active" : "variant-browser-card"}
                    data-legacy-variant-card-id={item.id}
                    key={item.id}
                    onClick={() => setActiveItemId(item.id)}
                    role="option"
                    type="button"
                  >
                    <div className="variant-browser-thumb">
                      {previewAsset ? (
                        <img alt={previewAsset.originalName} decoding="async" loading="lazy" src={assetThumbUrl(previewAsset.id)} />
                      ) : (
                        <div className="variant-browser-thumb-placeholder">{statusText(language, item.status)}</div>
                      )}
                      <span className="variant-browser-index">#{item.variantIndex}</span>
                    </div>
                    <div className="variant-browser-content">
                      <div className="variant-browser-head">
                        <strong className="variant-browser-title">
                          {imageTypeLabel(language, item.imageType, details.job.creationMode)}
                        </strong>
                        {isActive ? (
                          <span className="variant-browser-active-pill">{currentFocusLabel}</span>
                        ) : null}
                      </div>
                      <span className="helper variant-browser-meta">
                        {item.ratio}
                        {text.separator}
                        {item.resolutionLabel}
                      </span>
                      <div className="variant-browser-tags">
                        <span className={`variant-browser-state is-${item.status}`}>{statusText(language, item.status)}</span>
                        <span className={`review-status-chip is-${item.reviewStatus}`}>
                          {reviewStatusText(language, item.reviewStatus)}
                        </span>
                        {item.generatedAsset ? <span className="variant-browser-chip">{text.generated}</span> : null}
                        {isCompared ? (
                          <span className="variant-browser-chip is-compared">
                            {language === "zh" ? "对比中" : "Comparing"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel job-workbench-panel">
            <div className="split-header compact">
              <div>
                <h3>{text.previewWorkspace}</h3>
              </div>
            </div>
            {activeItem ? (
              <div className="job-workbench-topbar" hidden>
                <div className="job-workbench-focus">
                  <span className="helper">{currentFocusSummary}</span>
                  <strong>{currentFocusMeta}</strong>
                  <p className="helper">{statusText(language, activeItem.status)}</p>
                </div>
                <div className="job-workbench-topbar-actions">
                  <div className="job-workbench-nav">
                    <button className="ghost-button mini-button" disabled={!canSelectPreviousItem} onClick={selectPreviousItem} type="button">
                      {previousItemLabel}
                    </button>
                    <button className="ghost-button mini-button" disabled={!canSelectNextItem} onClick={selectNextItem} type="button">
                      {nextItemLabel}
                    </button>
                  </div>
                  <div className="job-workbench-toolbar">
                    <button className="ghost-button mini-button" onClick={() => handleReviewUpdate(activeItem.id, "shortlisted")} type="button">
                      {text.shortlisted}
                    </button>
                    <button className="ghost-button mini-button" onClick={() => handleReviewUpdate(activeItem.id, "approved")} type="button">
                      {text.approved}
                    </button>
                    <button className="ghost-button mini-button danger-button" onClick={() => handleReviewUpdate(activeItem.id, "rejected")} type="button">
                      {text.rejected}
                    </button>
                    <button className="ghost-button mini-button" onClick={() => handleReviewUpdate(activeItem.id, "unreviewed")} type="button">
                      {text.resetReview}
                    </button>
                    {activeItem.generatedAsset ? (
                      <button className="ghost-button mini-button" onClick={() => toggleCompare(activeItem.id)} type="button">
                        {compareIds.includes(activeItem.id) ? text.removeCompare : text.addCompare}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeItem ? (
              <>
                <div className="job-workbench-grid">
                <div className="job-preview-stage">
                  <figure className="job-preview-stage-card">
                    <figcaption className="job-preview-stage-head">
                      <div>
                        <strong>{text.generated}</strong>
                      </div>
                      {activeItem.generatedAsset ? (
                        <a download href={assetDownloadUrl(activeItem.generatedAsset.id)}>
                          {text.download}
                        </a>
                      ) : null}
                    </figcaption>
                    {activeItem.generatedAsset ? (
                      <div className="job-preview-stage-media">
                        <img
                          alt={activeItem.generatedAsset.originalName}
                          aria-label={previewZoomAriaLabel(
                            language,
                            details.job.productName,
                            activeItem.variantIndex,
                            details.items.length,
                          )}
                          className="job-preview-stage-image"
                          decoding="async"
                          onClick={() => openLightbox(activeItem.id)}
                          onKeyDown={(event) => handleLightboxKeyDown(event, activeItem.id)}
                          role="button"
                          src={assetPreviewUrl(activeItem.generatedAsset.id)}
                          tabIndex={0}
                        />
                        <button
                          aria-label={previousItemLabel}
                          className="job-preview-stage-nav-button is-previous"
                          disabled={!canSelectPreviousItem}
                          onClick={selectPreviousItem}
                          type="button"
                        >
                          <ChevronIcon direction="left" />
                        </button>
                        <button
                          aria-label={nextItemLabel}
                          className="job-preview-stage-nav-button is-next"
                          disabled={!canSelectNextItem}
                          onClick={selectNextItem}
                          type="button"
                        >
                          <ChevronIcon direction="right" />
                        </button>
                      </div>
                    ) : (
                      <div className="job-preview-placeholder">{text.noGeneratedImage}</div>
                    )}
                  </figure>
                </div>

                <aside className="job-preview-sidebar">
                  <div className="job-preview-header">
                    <div>
                      <strong>
                        {imageTypeLabel(language, activeItem.imageType, details.job.creationMode)}
                        {text.separator}
                        {activeItem.ratio}
                        {text.separator}
                        {activeItem.resolutionLabel}
                        {text.separator}#{activeItem.variantIndex}
                      </strong>
                      <p className="helper">{statusText(language, activeItem.status)}</p>
                    </div>
                    <span className={`review-status-chip is-${activeItem.reviewStatus}`}>
                      {reviewStatusText(language, activeItem.reviewStatus)}
                    </span>
                  </div>

                  <div className="variant-metadata-grid compact-metadata-grid">
                    <div className="variant-metadata-card">
                      <span className="helper">{text.requestSize}</span>
                      <strong>
                        {formatRequestedSizeDisplay({
                          width: activeItem.width,
                          height: activeItem.height,
                          resolutionLabel: activeItem.resolutionLabel,
                          language,
                          emptyLabel: text.unknown,
                        })}
                      </strong>
                    </div>
                    <div className="variant-metadata-card">
                      <span className="helper">{text.actualSize}</span>
                      <strong>
                        {formatDimensions(
                          activeItem.generatedAsset?.width ?? null,
                          activeItem.generatedAsset?.height ?? null,
                          text.unknown,
                        )}
                      </strong>
                    </div>
                    <div className="variant-metadata-card">
                      <span className="helper">{text.requestRatio}</span>
                      <strong>{activeItem.ratio}</strong>
                    </div>
                    <div className="variant-metadata-card">
                      <span className="helper">{text.actualRatio}</span>
                      <strong>
                        {formatRatio(
                          activeItem.generatedAsset?.width ?? null,
                          activeItem.generatedAsset?.height ?? null,
                          text.unknown,
                        )}
                      </strong>
                    </div>
                    <div className="variant-metadata-card is-wide">
                      <span className="helper">{text.actualFileSize}</span>
                      <strong>{formatSizeMb(activeItem.generatedAsset?.sizeBytes ?? null, text.unknown)}</strong>
                    </div>
                  </div>

                  {activeDimensionWarning ? (
                    <div className="provider-debug-panel">
                      <div className="detail-kv-head">
                        <strong>{text.warning}</strong>
                      </div>
                      <p className="warning-text">{activeDimensionWarning}</p>
                    </div>
                  ) : null}

                  {showCopySummaryCards && activeItem.copy ? (
                    <div className="copy-panel">
                      <strong>{activeItemNodeName}</strong>
                      {activeItem.copy.subtitle ? <p>{activeItem.copy.subtitle}</p> : null}
                      {activeItem.copy.highlights.length ? (
                        <ul>
                          {activeItem.copy.highlights.map((highlight) => (
                            <li key={highlight}>{highlight}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                </aside>
              </div>

                <div className="job-workbench-browser">
                <div className="job-workbench-browser-head">
                  <div>
                    <strong>{text.variantBrowser}</strong>
                  </div>
                </div>
                <div className="job-workbench-browser-strip" role="listbox">
                  {details.items.map((item) => {
                    const previewAsset = item.generatedAsset;
                    const isActive = item.id === activeItem?.id;
                    const isCompared = compareIds.includes(item.id);

                    return (
                      <button
                        aria-selected={isActive}
                        className={isActive ? "variant-browser-card is-active" : "variant-browser-card"}
                        data-variant-card-id={item.id}
                        key={item.id}
                        onClick={() => setActiveItemId(item.id)}
                        role="option"
                        type="button"
                      >
                        <div className="variant-browser-thumb">
                          {previewAsset ? (
                            <img alt={previewAsset.originalName} decoding="async" loading="lazy" src={assetThumbUrl(previewAsset.id)} />
                          ) : (
                            <div className="variant-browser-thumb-placeholder" />
                          )}
                          <span className="variant-browser-index">#{item.variantIndex}</span>
                        </div>
                        <div className="variant-browser-content">
                          <span className="variant-browser-type-chip">
                            {imageTypeLabel(language, item.imageType, details.job.creationMode)}
                          </span>
                          <span className="helper variant-browser-meta">
                            #{item.variantIndex}
                            {text.separator}
                            {item.ratio}
                            {text.separator}
                            {item.resolutionLabel}
                          </span>
                          <div className="variant-browser-tags">
                            <span className={`variant-browser-state is-${item.status}`}>{statusText(language, item.status)}</span>
                            <span className={`review-status-chip is-${item.reviewStatus}`}>
                              {reviewStatusText(language, item.reviewStatus)}
                            </span>
                            {item.generatedAsset ? <span className="variant-browser-chip">{text.generated}</span> : null}
                            {isCompared ? (
                              <span className="variant-browser-chip is-compared">
                                {language === "zh" ? "瀵规瘮涓?" : "Comparing"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                </div>
              </>
            ) : (
              <p className="helper">{text.noPreviewAvailable}</p>
            )}
          </section>

          {comparedItems.length ? (
            <section className="panel">
              <div className="split-header compact">
                <div>
                  <h3>{text.compare}</h3>
                </div>
              </div>
              <div className="compare-grid">
                {comparedItems.map((item) => (
                  <article className="compare-card" key={item.id}>
                    <img
                      alt={item.generatedAsset?.originalName || item.id}
                      aria-label={previewZoomAriaLabel(language, details.job.productName, item.variantIndex, comparedItems.length)}
                      decoding="async"
                      loading="lazy"
                      onClick={() => openLightbox(item.id)}
                      onKeyDown={(event) => handleLightboxKeyDown(event, item.id)}
                      role="button"
                      src={assetCompareUrl(item.generatedAsset!.id)}
                      tabIndex={0}
                    />
                    <div className="compare-card-meta">
                      <strong>
                        {imageTypeLabel(language, item.imageType, details.job.creationMode)}
                        {text.separator}
                        {item.ratio}
                        {text.separator}
                        {item.resolutionLabel}
                        {text.separator}#{item.variantIndex}
                      </strong>
                      <span className={`review-status-chip is-${item.reviewStatus}`}>
                        {reviewStatusText(language, item.reviewStatus)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <section className="panel detail-hub-panel">
        <div className="split-header compact">
          <div>
            <h3>{language === "zh" ? "信息面板" : "Detail hub"}</h3>
          </div>
        </div>
        <div aria-label={language === "zh" ? "详情标签" : "Detail tabs"} className="detail-tab-list" role="tablist">
          {detailTabs.map((tab) => (
            <button
              aria-selected={activeDetailTab === tab.id}
              className={activeDetailTab === tab.id ? "detail-tab-button is-active" : "detail-tab-button"}
              key={tab.id}
              onClick={() => setActiveDetailTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

      {activeDetailTab === "inputs" && detailRows.length ? (
        <section className="detail-tab-section">
          <details className="details-drawer compact-details" open>
            <summary>{text.translatedInfo}</summary>
            <div className="detail-compare-grid">
              <section className="detail-compare-column" aria-label={text.originalInfo}>
                <div className="detail-compare-heading">
                  <h4>{text.originalInfo}</h4>
                </div>
                <dl className="detail-kv-grid single-column">
                  {detailRows.map((row) => {
                    const fieldId = `original-${row.key}`;
                    return (
                      <div className="detail-kv-card" key={fieldId}>
                        <div className="detail-kv-head">
                          <dt>{row.label}</dt>
                          <button
                            className={`copy-chip-button${copiedFieldId === fieldId ? " is-copied" : ""}`}
                            onClick={() => handleCopy(fieldId, row.originalValue)}
                            type="button"
                          >
                            {copiedFieldId === fieldId ? text.copied : text.copy}
                          </button>
                        </div>
                        <dd>{row.originalValue || "-"}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              <section className="detail-compare-column" aria-label={text.localizedInfo}>
                <div className="detail-compare-heading">
                  <h4>{text.localizedInfo}</h4>
                </div>
                <dl className="detail-kv-grid single-column">
                  {detailRows.map((row) => {
                    const fieldId = `localized-${row.key}`;
                    return (
                      <div className="detail-kv-card" key={fieldId}>
                        <div className="detail-kv-head">
                          <dt>{row.label}</dt>
                          <button
                            className={`copy-chip-button${copiedFieldId === fieldId ? " is-copied" : ""}`}
                            onClick={() => handleCopy(fieldId, row.localizedValue)}
                            type="button"
                          >
                            {copiedFieldId === fieldId ? text.copied : text.copy}
                          </button>
                        </div>
                        <dd>{row.localizedValue || "-"}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>
            </div>
          </details>
        </section>
      ) : null}

      {activeDetailTab === "variants" ? (
      <section className="detail-tab-section">
          <div className="variant-drawer-list">
          {details.items.map((item, itemIndex) => {
            const dimensionWarning = getDimensionWarning(item);

            return (
            <details className="details-drawer compact-details variant-drawer" key={item.id}>
              <summary>
                <span className="variant-drawer-summary">
                  <span className="variant-drawer-title">
                    {imageTypeLabel(language, item.imageType, details.job.creationMode)}
                    {text.separator}
                    {item.ratio}
                    {text.separator}
                    {item.resolutionLabel}
                    {text.separator}#{item.variantIndex}
                  </span>
                  <span className="variant-drawer-meta">
                    <span className={`review-status-chip is-${item.reviewStatus}`}>
                      {reviewStatusText(language, item.reviewStatus)}
                    </span>
                    <span className="variant-browser-chip">{statusText(language, item.status)}</span>
                    {item.generatedAsset ? <span className="variant-browser-chip">{text.generated}</span> : null}
                    {item.id === activeItem?.id ? (
                      <span className="variant-browser-chip is-focus-chip">
                        {language === "zh" ? "当前焦点" : "Focused"}
                      </span>
                    ) : null}
                  </span>
                </span>
              </summary>
              <div className="variant-card variant-drawer-body">
              <header className="variant-header">
                <div>
                  <h4>
                    {imageTypeLabel(language, item.imageType, details.job.creationMode)}
                    {text.separator}
                    {item.ratio}
                    {text.separator}
                    {item.resolutionLabel}
                    {text.separator}#{item.variantIndex}
                  </h4>
                  <p className="helper">{statusText(language, item.status)}</p>
                </div>
                <div className="variant-toolbar">
                  <span className={`review-status-chip is-${item.reviewStatus}`}>
                    {reviewStatusText(language, item.reviewStatus)}
                  </span>
                  {item.generatedAsset ? (
                    <button className="ghost-button mini-button" onClick={() => toggleCompare(item.id)} type="button">
                      {compareIds.includes(item.id) ? text.removeCompare : text.addCompare}
                    </button>
                  ) : null}
                </div>
              </header>

              <div className="asset-grid">
                {item.generatedAsset ? (
                  <figure className="asset-card">
                    <img
                      alt={item.generatedAsset.originalName}
                      aria-label={previewZoomAriaLabel(language, details.job.productName, item.variantIndex, details.items.length)}
                      decoding="async"
                      loading="lazy"
                      onClick={() => openLightbox(item.id)}
                      onKeyDown={(event) => handleLightboxKeyDown(event, item.id)}
                      role="button"
                      src={assetGridUrl(item.generatedAsset.id)}
                      tabIndex={0}
                    />
                    <figcaption>
                      {text.generated}
                      <a download href={assetDownloadUrl(item.generatedAsset.id)}>
                        {text.download}
                      </a>
                    </figcaption>
                  </figure>
                ) : null}
              </div>

              <div className="variant-metadata-grid">
                <div className="variant-metadata-card">
                  <span className="helper">{text.requestSize}</span>
                  <strong>
                    {formatRequestedSizeDisplay({
                      width: item.width,
                      height: item.height,
                      resolutionLabel: item.resolutionLabel,
                      language,
                      emptyLabel: text.unknown,
                    })}
                  </strong>
                </div>
                <div className="variant-metadata-card">
                  <span className="helper">{text.actualSize}</span>
                  <strong>
                    {formatDimensions(item.generatedAsset?.width ?? null, item.generatedAsset?.height ?? null, text.unknown)}
                  </strong>
                </div>
                <div className="variant-metadata-card">
                  <span className="helper">{text.requestRatio}</span>
                  <strong>{item.ratio}</strong>
                </div>
                <div className="variant-metadata-card">
                  <span className="helper">{text.actualRatio}</span>
                  <strong>
                    {formatRatio(item.generatedAsset?.width ?? null, item.generatedAsset?.height ?? null, text.unknown)}
                  </strong>
                </div>
                <div className="variant-metadata-card is-wide">
                  <span className="helper">{text.actualFileSize}</span>
                  <strong>{formatSizeMb(item.generatedAsset?.sizeBytes ?? null, text.unknown)}</strong>
                </div>
              </div>

              {dimensionWarning ? (
                <div className="provider-debug-panel">
                  <div className="detail-kv-head">
                    <strong>{text.warning}</strong>
                  </div>
                  <p className="warning-text">{dimensionWarning}</p>
                </div>
              ) : null}

              <div className="variant-actions">
                <button className="ghost-button mini-button" onClick={() => handleReviewUpdate(item.id, "shortlisted")} type="button">
                  {text.shortlisted}
                </button>
                <button className="ghost-button mini-button" onClick={() => handleReviewUpdate(item.id, "approved")} type="button">
                  {text.approved}
                </button>
                <button className="ghost-button mini-button danger-button" onClick={() => handleReviewUpdate(item.id, "rejected")} type="button">
                  {text.rejected}
                </button>
                <button className="ghost-button mini-button" onClick={() => handleReviewUpdate(item.id, "unreviewed")} type="button">
                  {text.resetReview}
                </button>
              </div>

              {showCopySummaryCards && item.copy ? (
                <div className="copy-panel">
                  <strong>{String(itemIndex + 1)}</strong>
                  {item.copy.subtitle ? <p>{item.copy.subtitle}</p> : null}
                  {item.copy.highlights.length ? (
                    <ul>
                      {item.copy.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : item.errorMessage ? (
                <>
                  <p className="error-text">{item.errorMessage}</p>
                  {item.providerDebug?.imageUrl || item.providerDebug?.failureStage || item.providerDebug?.failureReason || item.providerDebug?.rawText ? (
                    <div className="provider-debug-panel">
                      {item.providerDebug?.imageUrl ? (
                        <div className="detail-kv-card provider-debug-card">
                          <div className="detail-kv-head">
                            <dt>{text.providerImageUrl}</dt>
                            <div className="button-row compact-row">
                              <a className="ghost-button mini-button" href={item.providerDebug.imageUrl} rel="noreferrer" target="_blank">
                                {text.openLink}
                              </a>
                              <button
                                className={`copy-chip-button${copiedFieldId === `provider-url-${item.id}` ? " is-copied" : ""}`}
                                onClick={() => handleCopy(`provider-url-${item.id}`, item.providerDebug?.imageUrl || "")}
                                type="button"
                              >
                                {copiedFieldId === `provider-url-${item.id}` ? text.copied : text.copy}
                              </button>
                            </div>
                          </div>
                          <dd>{item.providerDebug.imageUrl}</dd>
                        </div>
                      ) : null}
                      {getFailureStageLabel(item.providerDebug?.failureStage) ? (
                        <div className="detail-kv-card provider-debug-card">
                          <dt>{text.failureStage}</dt>
                          <dd>{getFailureStageLabel(item.providerDebug?.failureStage)}</dd>
                        </div>
                      ) : null}
                      {item.providerDebug?.failureReason ? (
                        <div className="detail-kv-card provider-debug-card">
                          <dt>{text.failureReason}</dt>
                          <dd>{item.providerDebug.failureReason}</dd>
                        </div>
                      ) : null}
                      {item.providerDebug?.rawText ? (
                        <details className="provider-debug-details">
                          <summary>{text.rawProviderResponse}</summary>
                          <pre className="json-block prompt-block">{item.providerDebug.rawText}</pre>
                        </details>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}

              {item.promptText ? (
                <div className="prompt-debug-panel">
                  <div className="detail-kv-head">
                    <strong>{actualPromptLabel}</strong>
                <div className="button-row compact-row">
                      <button
                        className={`copy-chip-button${copiedFieldId === `prompt-${item.id}` ? " is-copied" : ""}`}
                        onClick={() => handleCopy(`prompt-${item.id}`, item.promptText || "")}
                        type="button"
                      >
                        {copiedFieldId === `prompt-${item.id}` ? text.copied : text.copy}
                      </button>
                    </div>
                  </div>
                  <pre className="json-block prompt-block">{item.promptText}</pre>
                </div>
              ) : null}
              </div>
            </details>
          )})}
          </div>
      </section>
      ) : null}
      </section>
      <ImageLightbox
        closeLabel={language === "zh" ? "关闭预览" : "Close preview"}
        actionHref={activeLightboxItem?.actionHref}
        actionLabel={lightboxActionLabel}
        canNext={isLightboxOpen && activeLightboxIndex >= 0 && activeLightboxIndex < lightboxItems.length - 1}
        canPrev={isLightboxOpen && activeLightboxIndex > 0}
        currentIndex={isLightboxOpen ? activeLightboxIndex : -1}
        items={lightboxItems}
        nextLabel={nextImageLabel}
        onClose={() => setIsLightboxOpen(false)}
        onNext={() => selectLightboxItem(activeLightboxIndex + 1)}
        onPrev={() => selectLightboxItem(activeLightboxIndex - 1)}
        previousLabel={previousImageLabel}
      />
    </div>
  );
}
