import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

import { AssetServiceError, getAssetOrThrow } from "@/lib/server/assets/service";
import { mimeToExtension } from "@/lib/utils";

export const runtime = "nodejs";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

const RESIZABLE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/tiff"]);
const MIN_IMAGE_DIMENSION = 64;
const MAX_IMAGE_DIMENSION = 2048;
const DEFAULT_IMAGE_QUALITY = 78;
const MIN_IMAGE_QUALITY = 50;
const MAX_IMAGE_QUALITY = 90;

// Cap Sharp's in-process cache so large preview bursts do not keep too much memory resident.
sharp.cache({ memory: 32, files: 0, items: 64 });

function inferDownloadName(originalName: string, mimeType: string) {
  const trimmed = originalName.trim() || "asset";
  const currentExtension = path.extname(trimmed);
  const preferredExtension = MIME_EXTENSION_MAP[mimeType] ?? "";

  if (currentExtension && currentExtension !== ".generated") {
    return trimmed;
  }

  const baseName = currentExtension ? path.basename(trimmed, currentExtension) : trimmed;
  return `${baseName}${preferredExtension}`;
}

function toAsciiFilename(filename: string) {
  const extension = path.extname(filename);
  const baseName = path.basename(filename, extension);
  const normalizedBase = baseName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
  const safeExtension = /^[.A-Za-z0-9_-]+$/.test(extension) ? extension : "";
  return `${normalizedBase}${safeExtension}`;
}

function makeContentDisposition(filename: string) {
  const asciiFilename = toAsciiFilename(filename);
  const encodedFilename = encodeURIComponent(filename)
    .replace(/['()]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");

  return `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`;
}

function clampInteger(value: string | null, minimum: number, maximum: number) {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.min(maximum, Math.max(minimum, parsed));
}

function assetPathCandidates(filePath: string, mimeType: string) {
  const extension = mimeToExtension(mimeType);
  const expectedSuffix = extension ? `.${extension}` : "";
  const currentExtension = path.extname(filePath).toLowerCase();

  if (!expectedSuffix) {
    return [filePath];
  }

  if (!currentExtension) {
    return [filePath, `${filePath}${expectedSuffix}`];
  }

  if (currentExtension === expectedSuffix) {
    return [filePath, filePath.slice(0, -expectedSuffix.length)];
  }

  return [filePath, `${filePath}${expectedSuffix}`];
}

function resolveExistingAssetPath(filePath: string, mimeType: string) {
  for (const candidate of assetPathCandidates(filePath, mimeType)) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return filePath;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  let asset;
  try {
    const { assetId } = await params;
    asset = getAssetOrThrow(assetId);
  } catch (error) {
    if (error instanceof AssetServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Asset not found." }, { status: 404 });
  }

  const filename = inferDownloadName(asset.originalName, asset.mimeType);
  const actualFilePath = resolveExistingAssetPath(asset.filePath, asset.mimeType);
  const shouldDownload = request.nextUrl.searchParams.get("download") === "1";
  const requestedWidth = clampInteger(request.nextUrl.searchParams.get("w"), MIN_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION);
  const requestedQuality =
    clampInteger(request.nextUrl.searchParams.get("q"), MIN_IMAGE_QUALITY, MAX_IMAGE_QUALITY) ?? DEFAULT_IMAGE_QUALITY;
  const targetWidth = !shouldDownload && requestedWidth !== null && RESIZABLE_MIME_TYPES.has(asset.mimeType) ? requestedWidth : null;

  const headers = new Headers({
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  });

  if (shouldDownload) {
    headers.set("Content-Type", asset.mimeType);
    headers.set("Content-Disposition", makeContentDisposition(filename));
  }

  if (targetWidth) {
    try {
      const buffer = await sharp(actualFilePath)
        .rotate()
        .resize({
          width: targetWidth,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({
          quality: requestedQuality,
          effort: 4,
        })
        .toBuffer();

      headers.set("Content-Type", "image/webp");
      return new NextResponse(Uint8Array.from(buffer), { headers });
    } catch {
      // Fall back to the original asset when optimization fails.
    }
  }

  headers.set("Content-Type", asset.mimeType);
  const stream = fs.createReadStream(actualFilePath);
  const webStream = Readable.toWeb(stream) as ReadableStream;

  return new NextResponse(webStream, { headers });
}
