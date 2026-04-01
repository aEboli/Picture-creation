import "server-only";

import { processJob } from "@/lib/server/generation/process-job";
import { recoverQueueJobIds } from "@/lib/server/jobs/recovery";
import { getSettingsSnapshot } from "@/lib/server/settings/store";
import type { ProviderOverride } from "@/lib/types";

declare global {
  var commerceStudioQueue:
    | {
        active: number;
        pending: string[];
        overrides: Map<string, ProviderOverride | undefined>;
        recoveryPromise?: Promise<void>;
        recovered: boolean;
      }
    | undefined;
}

function getQueue() {
  if (!globalThis.commerceStudioQueue) {
    globalThis.commerceStudioQueue = {
      active: 0,
      pending: [],
      overrides: new Map(),
      recoveryPromise: undefined,
      recovered: false,
    };
  }

  return globalThis.commerceStudioQueue;
}

async function ensureQueueRecovered() {
  const queue = getQueue();
  if (queue.recovered) {
    return;
  }

  if (!queue.recoveryPromise) {
    queue.recoveryPromise = Promise.resolve()
      .then(() => {
        const recoverableJobIds = recoverQueueJobIds();
        for (const jobId of recoverableJobIds) {
          if (!queue.pending.includes(jobId)) {
            queue.pending.push(jobId);
          }
        }
        queue.recovered = true;
      })
      .finally(() => {
        queue.recoveryPromise = undefined;
      });
  }

  await queue.recoveryPromise;
}

async function pumpQueue() {
  const queue = getQueue();
  await ensureQueueRecovered();
  const { maxConcurrency } = getSettingsSnapshot();

  while (queue.active < maxConcurrency && queue.pending.length > 0) {
    const nextJobId = queue.pending.shift();
    if (!nextJobId) {
      return;
    }

    queue.active += 1;
    const providerOverride = queue.overrides.get(nextJobId);

    void processJob(nextJobId, providerOverride)
      .catch(() => undefined)
      .finally(() => {
        queue.overrides.delete(nextJobId);
        queue.active -= 1;
        void pumpQueue();
      });
  }
}

export function enqueueJob(jobId: string, providerOverride?: ProviderOverride) {
  const queue = getQueue();
  if (!queue.pending.includes(jobId)) {
    queue.pending.push(jobId);
  }
  queue.overrides.set(jobId, providerOverride);
  void pumpQueue();
}

export function ensureQueueReady() {
  void pumpQueue();
}
