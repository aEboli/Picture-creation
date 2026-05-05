import "server-only";

import { getAssetById } from "@/lib/db";
import type { AssetRecord } from "@/lib/types";

export function getAssetRecordById(assetId: string): AssetRecord | null {
  return getAssetById(assetId);
}
