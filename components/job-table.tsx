"use client";

import Link from "next/link";
import { useState } from "react";

import { ImageLightbox, type ImageLightboxItem } from "@/components/image-lightbox";
import { buildAssetUrl } from "@/lib/asset-url";
import type { JobRecord, UiLanguage } from "@/lib/types";

type HistoryLightboxItem = ImageLightboxItem & {
  jobItemId: string;
};

function statusLabel(language: UiLanguage, status: string) {
  const labels = {
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

  return labels[language][status as keyof (typeof labels)["zh"]] ?? status;
}

function statusClassName(status: string) {
  const statusMap = {
    queued: "is-queued",
    processing: "is-processing",
    completed: "is-completed",
    partial: "is-partial",
    failed: "is-failed",
  } as const;

  return statusMap[status as keyof typeof statusMap] ?? "is-queued";
}

function formatDateTime(language: UiLanguage, value: string) {
  const date = new Date(value);
  const locale = language === "zh" ? "zh-CN" : "en-US";

  return {
    date: date.toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    time: date.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }),
  };
}

function formatJobDuration(language: UiLanguage, job: JobRecord) {
  const endValue =
    job.completedAt ?? (job.status === "failed" || job.status === "partial" ? job.updatedAt : null);

  if (!endValue) {
    if (job.status === "queued" || job.status === "processing") {
      return language === "zh" ? "进行中" : "In progress";
    }

    return "—";
  }

  const start = new Date(job.createdAt).getTime();
  const end = new Date(endValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return "—";
  }

  const totalSeconds = Math.max(1, Math.round((end - start) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (language === "zh") {
    if (hours > 0) {
      return `${hours}小时 ${minutes}分 ${seconds}秒`;
    }

    if (minutes > 0) {
      return `${minutes}分 ${seconds}秒`;
    }

    return `${seconds}秒`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatSuccessRate(language: UiLanguage, job: JobRecord) {
  const total = job.generatedCount > 0 ? job.generatedCount : job.succeededCount + job.failedCount;

  if (total <= 0) {
    return language === "zh" ? "暂无" : "N/A";
  }

  return `${Math.round((job.succeededCount / total) * 100)}%`;
}

function formatGroupCount(language: UiLanguage, job: JobRecord) {
  const count = job.generatedCount > 0 ? job.generatedCount : job.previewImageCount;

  if (language === "zh") {
    return `${count} 组`;
  }

  return `${count} groups`;
}

function assetPreviewUrl(assetId: string) {
  return buildAssetUrl(assetId, { width: 240, quality: 74 });
}

function assetOriginalUrl(assetId: string) {
  return buildAssetUrl(assetId);
}

function modeLabel(language: UiLanguage, mode: JobRecord["creationMode"]) {
  if (mode === "reference-remix") {
    return language === "zh" ? "参考重绘" : "Reference remix";
  }
  if (mode === "amazon-a-plus") {
    return language === "zh" ? "Amazon A+" : "Amazon A+";
  }
  if (mode === "suite") {
    return language === "zh" ? "套图模式" : "Image set mode";
  }
  if (mode === "prompt") {
    return language === "zh" ? "Prompt 模式" : "Prompt mode";
  }

  return language === "zh" ? "标准模式" : "Standard";
}

function previewZoomAriaLabel(language: UiLanguage, productName: string, index: number, total: number) {
  return language === "zh"
    ? `打开 ${productName} 的第 ${index} / ${total} 张预览图`
    : `Open preview ${index} of ${total} for ${productName}`;
}

function lightboxActionHref(jobId: string, jobItemId: string) {
  return `/jobs/${jobId}?itemId=${encodeURIComponent(jobItemId)}`;
}

function itemCountLabel(language: UiLanguage, total: number) {
  return language === "zh" ? `${total} 张预览` : `${total} previews`;
}

export function JobTable({ jobs, language }: { jobs: JobRecord[]; language: UiLanguage }) {
  const [lightboxState, setLightboxState] = useState<{
    currentIndex: number;
    items: HistoryLightboxItem[];
    jobId: string;
  } | null>(null);

  return (
    <>
      <div className="history-card-list">
        {jobs.map((job) => {
          const createdAt = formatDateTime(language, job.createdAt);
          const previewItems: HistoryLightboxItem[] = job.previewAssets.map((asset, index) => ({
            alt: asset.originalName,
            jobItemId: asset.jobItemId,
            label: previewZoomAriaLabel(language, job.productName, index + 1, job.previewAssets.length),
            src: assetOriginalUrl(asset.id),
          }));
          const primaryPreview = job.previewAssets[0] ?? null;
          const previewOverflow = Math.max(0, job.previewImageCount - 1);
          const durationLabel = formatJobDuration(language, job);
          const successRate = formatSuccessRate(language, job);
          const openLabel = language === "zh" ? "查看详情" : "Open details";
          const tags = [job.platform, job.country, job.language, modeLabel(language, job.creationMode)].filter(Boolean);
          const statusClass = statusClassName(job.status);

          return (
            <article className={`history-job-card ${statusClass}`} key={job.id}>
              <div className="history-job-card-main">
                <div className="history-job-overview">
                  {primaryPreview ? (
                    <button
                      aria-label={previewZoomAriaLabel(language, job.productName, 1, previewItems.length)}
                      className="history-job-thumb"
                      onClick={() =>
                        setLightboxState({
                          currentIndex: 0,
                          items: previewItems,
                          jobId: job.id,
                        })
                      }
                      title={primaryPreview.originalName}
                      type="button"
                    >
                      <img
                        alt={primaryPreview.originalName}
                        className="history-job-thumb-image"
                        decoding="async"
                        loading="lazy"
                        src={assetPreviewUrl(primaryPreview.id)}
                      />
                      {previewOverflow > 0 ? (
                        <span className="history-job-thumb-count">+{previewOverflow}</span>
                      ) : (
                        <span className="history-job-thumb-meta">{itemCountLabel(language, job.previewImageCount)}</span>
                      )}
                    </button>
                  ) : (
                    <div className="history-job-thumb is-empty">
                      <span className="history-job-thumb-empty">{language === "zh" ? "暂无预览" : "No preview"}</span>
                    </div>
                  )}

                  <div className="history-job-card-primary">
                    <div className="history-job-copy">
                      <Link className="history-job-title-link" href={`/jobs/${job.id}`}>
                        <strong className="history-job-title">{job.productName}</strong>
                      </Link>
                      <span className="history-job-subtitle">#{job.id}</span>
                    </div>
                  </div>
                </div>

                <div className="history-job-meta">
                  <span className={`history-status-badge ${statusClass}`}>{statusLabel(language, job.status)}</span>
                  <div className="history-job-tags" aria-label={language === "zh" ? "任务标签" : "Job tags"}>
                    {tags.map((tag) => (
                      <span className="history-job-tag" key={`${job.id}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Link className="history-job-open-inline" href={`/jobs/${job.id}`}>
                    {openLabel}
                  </Link>
                </div>

                <div className="history-job-metrics">
                  <div className="history-job-metric is-success">
                    <span className="history-job-metric-label">{language === "zh" ? "成功率" : "Success rate"}</span>
                    <div className="history-job-metric-value-group">
                      <strong>{successRate}</strong>
                    </div>
                  </div>
                  <div className="history-job-metric is-time has-subline">
                    <span className="history-job-metric-label">{language === "zh" ? "时间" : "Time"}</span>
                    <div className="history-job-metric-value-group">
                      <strong>{createdAt.date}</strong>
                      <small>{createdAt.time}</small>
                    </div>
                  </div>
                  <div className="history-job-metric is-duration">
                    <span className="history-job-metric-label">{language === "zh" ? "完成耗时" : "Duration"}</span>
                    <div className="history-job-metric-value-group">
                      <strong>{durationLabel}</strong>
                    </div>
                  </div>
                  <div className="history-job-metric is-groups">
                    <span className="history-job-metric-label">{language === "zh" ? "组数" : "Groups"}</span>
                    <div className="history-job-metric-value-group">
                      <strong>{formatGroupCount(language, job)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <ImageLightbox
        actionHref={
          lightboxState
            ? lightboxActionHref(
                lightboxState.jobId,
                lightboxState.items[lightboxState.currentIndex]?.jobItemId ?? "",
              )
            : null
        }
        actionLabel={language === "zh" ? "打开" : "Open"}
        canNext={Boolean(lightboxState && lightboxState.currentIndex < lightboxState.items.length - 1)}
        canPrev={Boolean(lightboxState && lightboxState.currentIndex > 0)}
        closeLabel={language === "zh" ? "关闭预览" : "Close preview"}
        currentIndex={lightboxState?.currentIndex ?? -1}
        items={lightboxState?.items ?? []}
        nextLabel={language === "zh" ? "下一张" : "Next image"}
        onClose={() => setLightboxState(null)}
        onNext={() =>
          setLightboxState((current) =>
            current && current.currentIndex < current.items.length - 1
              ? { ...current, currentIndex: current.currentIndex + 1 }
              : current,
          )
        }
        onPrev={() =>
          setLightboxState((current) =>
            current && current.currentIndex > 0 ? { ...current, currentIndex: current.currentIndex - 1 } : current,
          )
        }
        previousLabel={language === "zh" ? "上一张" : "Previous image"}
      />
    </>
  );
}
