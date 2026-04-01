import fs from "node:fs/promises";
import path from "node:path";

import { zipSync } from "fflate";
import { NextResponse } from "next/server";

import {
  buildAllImagesZipName,
  buildGeneratedImageDownloadName,
  dedupeDownloadFilenames,
  makeContentDisposition,
} from "@/lib/download-filenames";
import { getJobDetailsOrThrow, JobQueryError } from "@/lib/server/jobs/queries";
import { mimeToExtension } from "@/lib/utils";

export const runtime = "nodejs";

const ALL_IMAGE_FOLDER = "全部图片";

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

async function readAssetFile(filePath: string, mimeType: string) {
  for (const candidate of assetPathCandidates(filePath, mimeType)) {
    try {
      return await fs.readFile(candidate);
    } catch {
      // Try the next compatible candidate.
    }
  }

  return fs.readFile(filePath);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let details;
  try {
    const { id } = await params;
    details = getJobDetailsOrThrow(id);
  } catch (error) {
    if (error instanceof JobQueryError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    throw error;
  }

  const requestUrl = new URL(request.url);
  const language = requestUrl.searchParams.get("language") === "en" ? "en" : "zh";
  const successfulItems = details.items.filter((item) => item.generatedAsset);

  if (!successfulItems.length) {
    return NextResponse.json({ error: "No successful generated images found for this job." }, { status: 400 });
  }

  const sourceAssetNames = details.sourceAssets.length
    ? details.sourceAssets.map((asset) => asset.originalName)
    : [details.job.productName || "all-images"];
  const filenames = dedupeDownloadFilenames(
    successfulItems.map((item) =>
      buildGeneratedImageDownloadName({
        sourceAssetName:
          item.sourceAssetName && item.sourceAssetName !== "prompt-only" ? item.sourceAssetName : details.job.productName || "generated-image",
        imageType: item.imageType,
        creationMode: details.job.creationMode,
        resolutionLabel: item.resolutionLabel,
        ratio: item.ratio,
        mimeType: item.generatedAsset!.mimeType,
        language,
      }),
    ),
  );

  const zipEntries: Record<string, Uint8Array> = {};

  for (const [index, item] of successfulItems.entries()) {
    const generatedAsset = item.generatedAsset;
    if (!generatedAsset) {
      continue;
    }

    const buffer = await readAssetFile(generatedAsset.filePath, generatedAsset.mimeType);
    zipEntries[`${ALL_IMAGE_FOLDER}/${filenames[index]}`] = new Uint8Array(buffer);
  }

  const zipBuffer = Buffer.from(zipSync(zipEntries, { level: 6 }));
  const zipName = buildAllImagesZipName(sourceAssetNames);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": makeContentDisposition(zipName),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
