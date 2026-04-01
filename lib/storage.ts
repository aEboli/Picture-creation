import fs from "node:fs/promises";
import path from "node:path";

import { getSettingsSnapshot } from "@/lib/server/settings/store";
import type { AssetRecord } from "@/lib/types";
import { createId, detectImageDimensions, mimeToExtension, nowIso, sha256 } from "@/lib/utils";

function buildStoredAssetPath(dir: string, assetId: string, mimeType: string) {
  switch (mimeToExtension(mimeType)) {
    case "png":
      return path.join(dir, `${assetId}.png`);
    case "webp":
      return path.join(dir, `${assetId}.webp`);
    case "jpg":
      return path.join(dir, `${assetId}.jpg`);
    case "svg":
      return path.join(dir, `${assetId}.svg`);
    default:
      return path.join(dir, `${assetId}.bin`);
  }
}

async function resolveStoredAssetPath(filePath: string, mimeType: string) {
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    const extension = mimeToExtension(mimeType);

    if (!extension || path.extname(filePath)) {
      throw new Error("Asset file not found.");
    }

    const withExtension = `${filePath}.${extension}`;
    await fs.access(withExtension);
    return withExtension;
  }
}

export async function ensureStorageDir() {
  const settings = getSettingsSnapshot();
  await fs.mkdir(settings.storageDir, { recursive: true });
  return settings.storageDir;
}

export async function writeFileAsset(input: {
  jobId: string;
  jobItemId?: string | null;
  kind: AssetRecord["kind"];
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  width?: number | null;
  height?: number | null;
}): Promise<AssetRecord> {
  const storageDir = await ensureStorageDir();
  const assetId = createId("asset");
  const dayFolder = nowIso().slice(0, 10);
  const dir = path.join(storageDir, dayFolder);
  await fs.mkdir(dir, { recursive: true });
  const filePath = buildStoredAssetPath(dir, assetId, input.mimeType);
  await fs.writeFile(filePath, input.buffer);
  const detectedDimensions =
    input.mimeType === "image/svg+xml" ? null : detectImageDimensions(input.buffer, input.mimeType);

  return {
    id: assetId,
    jobId: input.jobId,
    jobItemId: input.jobItemId ?? null,
    kind: input.kind,
    originalName: input.originalName,
    mimeType: input.mimeType,
    filePath,
    width: detectedDimensions?.width ?? input.width ?? null,
    height: detectedDimensions?.height ?? input.height ?? null,
    sizeBytes: input.buffer.byteLength,
    sha256: sha256(input.buffer),
    createdAt: nowIso(),
  };
}

export async function readAssetBuffer(asset: AssetRecord): Promise<Buffer> {
  return fs.readFile(await resolveStoredAssetPath(asset.filePath, asset.mimeType));
}
