import "server-only";

import { listRecoverableQueuedJobIds, restoreRecoverableJob } from "./store";

export function recoverQueueJobIds() {
  const recoverableJobIds = listRecoverableQueuedJobIds();

  for (const jobId of recoverableJobIds) {
    restoreRecoverableJob(jobId);
  }

  return recoverableJobIds;
}
