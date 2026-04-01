import "server-only";

import {
  createJob,
  getJobDetails,
  getSettings,
  listRecoverableJobIds,
  listJobs,
  markJobQueued,
  type JobListFilters,
  resetJobItemsToQueued,
  updateJobFeishuSyncState,
  updateJobItemWarning,
} from "@/lib/db";
import type { CreateJobInput } from "@/lib/types";

export function createQueuedJob(input: CreateJobInput) {
  return createJob(input);
}

export function getJobDetailsById(jobId: string) {
  return getJobDetails(jobId);
}

export function listJobsByFilters(filters: JobListFilters) {
  return listJobs(filters);
}

export function getJobSyncSettings() {
  return getSettings();
}

export function saveJobFeishuSyncState(jobId: string, recordId: string | null, fileTokens: string[]) {
  updateJobFeishuSyncState(jobId, recordId, fileTokens);
}

export function saveJobItemWarning(itemId: string, warningMessage: string | null) {
  updateJobItemWarning(itemId, warningMessage);
}

export function listRecoverableQueuedJobIds() {
  return listRecoverableJobIds();
}

export function restoreRecoverableJob(jobId: string) {
  resetJobItemsToQueued(jobId);
  markJobQueued(jobId);
}
