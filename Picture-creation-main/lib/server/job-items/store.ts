import "server-only";

import { getJobItemById, updateJobItemReviewStatus } from "@/lib/db";
import type { JobItemRecord, JobItemReviewStatus } from "@/lib/types";

export function getJobItemRecordById(itemId: string): JobItemRecord | null {
  return getJobItemById(itemId);
}

export function updateJobItemReviewStatusRecord(itemId: string, reviewStatus: JobItemReviewStatus): JobItemRecord | null {
  return updateJobItemReviewStatus(itemId, reviewStatus);
}
