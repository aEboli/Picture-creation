import { IMAGE_TYPE_OPTIONS } from "@/lib/constants";
import type { CreationMode, UiLanguage } from "@/lib/types";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

function splitExtension(filename: string) {
  const trimmed = filename.trim();
  const dotIndex = trimmed.lastIndexOf(".");

  if (dotIndex <= 0) {
    return { baseName: trimmed, extension: "" };
  }

  return {
    baseName: trimmed.slice(0, dotIndex),
    extension: trimmed.slice(dotIndex),
  };
}

function sanitizeFilenamePart(value: string) {
  return (
    value
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .replace(/^[-.\s]+|[-.\s]+$/g, "") || "image"
  );
}

function inferExtension(originalName: string, mimeType: string) {
  const { extension } = splitExtension(originalName);
  if (extension && extension !== ".generated") {
    return extension;
  }

  return MIME_EXTENSION_MAP[mimeType] ?? "";
}

function normalizeRatioForFilename(ratio: string) {
  return sanitizeFilenamePart(ratio.replace(/:/g, "x"));
}

function imageTypeDownloadLabel(language: UiLanguage, imageType: string, creationMode?: CreationMode) {
  if (creationMode === "reference-remix") {
    return language === "zh" ? "复刻图" : "Remake image";
  }

  return IMAGE_TYPE_OPTIONS.find((option) => option.value === imageType)?.label[language] ?? imageType;
}

export function inferDownloadName(originalName: string, mimeType: string) {
  const trimmed = originalName.trim() || "asset";
  const { baseName, extension } = splitExtension(trimmed);
  if (extension && extension !== ".generated") {
    return trimmed;
  }

  return `${baseName || "asset"}${inferExtension(trimmed, mimeType)}`;
}

export function sanitizeDownloadFilename(filename: string) {
  const { baseName, extension } = splitExtension(filename);
  const safeBaseName = sanitizeFilenamePart(baseName);
  const safeExtension = extension.replace(/[^\w.-]+/g, "") || "";
  return `${safeBaseName}${safeExtension}`;
}

export function buildGeneratedImageDownloadName(input: {
  sourceAssetName: string;
  imageType: string;
  creationMode?: CreationMode;
  resolutionLabel: string;
  ratio: string;
  mimeType: string;
  language: UiLanguage;
}) {
  const sourceBaseName = sanitizeFilenamePart(splitExtension(input.sourceAssetName).baseName || input.sourceAssetName || "image");
  const typeLabel = sanitizeFilenamePart(imageTypeDownloadLabel(input.language, input.imageType, input.creationMode));
  const resolutionLabel = sanitizeFilenamePart(input.resolutionLabel);
  const ratioLabel = normalizeRatioForFilename(input.ratio);
  const extension = inferExtension(input.sourceAssetName, input.mimeType);

  return `${sourceBaseName}-${typeLabel}-${resolutionLabel}-${ratioLabel}${extension}`;
}

export function dedupeDownloadFilenames(filenames: string[]) {
  const seen = new Map<string, number>();

  return filenames.map((filename) => {
    const count = (seen.get(filename) ?? 0) + 1;
    seen.set(filename, count);

    if (count === 1) {
      return filename;
    }

    const { baseName, extension } = splitExtension(filename);
    return `${baseName}_${String(count).padStart(2, "0")}${extension}`;
  });
}

export function buildAllImagesZipName(sourceAssetNames: string[]) {
  const primarySourceName = sourceAssetNames.find((name) => name.trim()) ?? "all-images";
  const { baseName } = splitExtension(primarySourceName);
  return `${sanitizeFilenamePart(baseName || primarySourceName)}-all-images.zip`;
}

function toAsciiFilename(filename: string) {
  const { baseName, extension } = splitExtension(filename);
  const normalizedBase =
    sanitizeFilenamePart(
      baseName
        .normalize("NFKD")
        .replace(/[^\x20-\x7E]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-"),
    ) || "download";
  const safeExtension = /^[.A-Za-z0-9_-]+$/.test(extension) ? extension : "";
  return `${normalizedBase}${safeExtension}`;
}

export function makeContentDisposition(filename: string) {
  const asciiFilename = toAsciiFilename(filename);
  const encodedFilename = encodeURIComponent(filename)
    .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}
