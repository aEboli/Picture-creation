import "server-only";

import { getSettings } from "@/lib/db";
import { buildCreateJobInput } from "@/lib/job-builder";
import { createAndEnqueueJob } from "@/lib/server/jobs/lifecycle";
import { writeFileAsset } from "@/lib/storage";
import { createId } from "@/lib/utils";

import {
  GenerationRequestError,
  normalizeCreatePayload,
  parseCreatePayload,
  sanitizeTemporaryProvider,
  validateCreatePayload,
} from "./payload";

function getFiles(formData: FormData, key: string) {
  return formData.getAll(key).filter((file): file is File => file instanceof File);
}

async function writeUploadedAssets(input: {
  files: File[];
  jobId: string;
  kind: "source" | "reference";
}) {
  return Promise.all(
    input.files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      return writeFileAsset({
        jobId: input.jobId,
        kind: input.kind,
        originalName: file.name,
        mimeType: file.type || "image/png",
        buffer,
      });
    }),
  );
}

export { GenerationRequestError };

export async function createGenerationJobFromFormData(formData: FormData) {
  const payload = normalizeCreatePayload(parseCreatePayload(formData.get("payload")));
  const settings = getSettings();
  const sourceFiles = getFiles(formData, "files");
  const referenceFiles = getFiles(formData, "referenceFiles");

  validateCreatePayload(payload, {
    imageModel: settings.defaultImageModel,
    sourceFileCount: sourceFiles.length,
    referenceFileCount: referenceFiles.length,
  });

  const jobId = createId("job");
  const sourceAssets = await writeUploadedAssets({
    files: sourceFiles,
    jobId,
    kind: "source",
  });
  const referenceAssets = await writeUploadedAssets({
    files: referenceFiles,
    jobId,
    kind: "reference",
  });

  const createInput = buildCreateJobInput(sourceAssets, payload, jobId, referenceAssets);
  const job = createAndEnqueueJob({
    createInput,
    providerOverride: sanitizeTemporaryProvider(payload.temporaryProvider),
  });

  return { jobId: job.id };
}
