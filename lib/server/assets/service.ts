import "server-only";

import { cache } from "react";

import type { AssetRecord } from "@/lib/types";

import { getAssetRecordById } from "./store";

export class AssetServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AssetServiceError";
    this.status = status;
  }
}

const readAssetRecord = cache((assetId: string) => getAssetRecordById(assetId));

export function getAssetOrThrow(assetId: string): AssetRecord {
  const asset = readAssetRecord(assetId);
  if (!asset) {
    throw new AssetServiceError("Asset not found.", 404);
  }

  return asset;
}
