import "server-only";

import { rebuildJobFeishuSync } from "@/lib/feishu";

import { JobQueryError, getJobDetailsOrThrow } from "./queries";
import { getJobDetailsById, getJobSyncSettings, saveJobFeishuSyncState, saveJobItemWarning } from "./store";

export class JobSyncError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JobSyncError";
    this.status = status;
  }
}

export async function rebuildJobFeishuSyncById(jobId: string) {
  const details = getJobDetailsOrThrow(jobId);
  const settings = getJobSyncSettings();

  if (!settings.feishuSyncEnabled) {
    throw new JobSyncError("Feishu sync is not enabled.", 400);
  }

  try {
    const result = await rebuildJobFeishuSync({
      settings,
      details,
    });

    if (result) {
      saveJobFeishuSyncState(jobId, result.recordId, result.fileTokens);
    }

    const warningByItemId = new Map(result?.itemResults.map((itemResult) => [itemResult.itemId, itemResult]) ?? []);
    for (const item of details.items) {
      if (!item.generatedAsset) {
        continue;
      }

      const syncResult = warningByItemId.get(item.id);
      if (syncResult?.ok) {
        if (item.warningMessage?.startsWith("Feishu sync failed:")) {
          saveJobItemWarning(item.id, null);
        }
        continue;
      }

      if (syncResult?.message) {
        saveJobItemWarning(item.id, `Feishu sync failed: ${syncResult.message}`);
      }
    }

    return {
      ok: true,
      uploadedCount: result?.fileTokens.length ?? 0,
      failedCount: result?.itemResults.filter((itemResult) => !itemResult.ok).length ?? 0,
      details: getJobDetailsById(jobId),
    };
  } catch (error) {
    if (error instanceof JobQueryError || error instanceof JobSyncError) {
      throw error;
    }

    throw new JobSyncError(error instanceof Error ? error.message : "Feishu resync failed.", 500);
  }
}
