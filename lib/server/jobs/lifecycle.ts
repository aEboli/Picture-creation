import "server-only";

import type { CreateJobInput } from "@/lib/types";
import { buildRetryJobInput } from "@/lib/job-builder";
import { enqueueJob } from "@/lib/queue";
import type { ProviderOverride } from "@/lib/types";

import { createQueuedJob, getJobDetailsById } from "./store";

export class JobLifecycleError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JobLifecycleError";
    this.status = status;
  }
}

export function createAndEnqueueJob(input: {
  createInput: CreateJobInput;
  providerOverride?: ProviderOverride;
}) {
  const job = createQueuedJob(input.createInput);
  enqueueJob(job.id, input.providerOverride);
  return job;
}

export function retryJobById(jobId: string) {
  const details = getJobDetailsById(jobId);
  if (!details) {
    throw new JobLifecycleError("Job not found.", 404);
  }

  const createInput = buildRetryJobInput(details);
  const newJob = createAndEnqueueJob({ createInput });
  return { jobId: newJob.id };
}
