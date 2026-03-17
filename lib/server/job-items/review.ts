import "server-only";

import type { JobItemReviewStatus } from "@/lib/types";

import { getJobItemRecordById, updateJobItemReviewStatusRecord } from "./store";

const REVIEW_STATUSES: JobItemReviewStatus[] = ["unreviewed", "shortlisted", "approved", "rejected"];

export class JobItemReviewServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JobItemReviewServiceError";
    this.status = status;
  }
}

export function updateJobItemReviewById(itemId: string, reviewStatus: string | undefined) {
  const existing = getJobItemRecordById(itemId);
  if (!existing) {
    throw new JobItemReviewServiceError("Job item not found.", 404);
  }

  if (!reviewStatus || !REVIEW_STATUSES.includes(reviewStatus as JobItemReviewStatus)) {
    throw new JobItemReviewServiceError("Invalid review status.", 400);
  }

  return updateJobItemReviewStatusRecord(itemId, reviewStatus as JobItemReviewStatus);
}
