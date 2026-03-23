import "server-only";

import { cache } from "react";

import type { JobListFilters } from "@/lib/db";
import type { JobDetails } from "@/lib/types";

import { getJobDetailsById, listJobsByFilters } from "./store";

export class JobQueryError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JobQueryError";
    this.status = status;
  }
}

const readRawJobDetails = cache((jobId: string) => getJobDetailsById(jobId));
const readClientSafeJobDetails = cache((jobId: string) => shapeJobDetailsForClient(readRawJobDetails(jobId)));

function shouldHideIntermediateJobFields(creationMode: JobDetails["job"]["creationMode"]) {
  return creationMode === "standard" || creationMode === "suite" || creationMode === "amazon-a-plus";
}

export function removeWorkflowWarningMessage(warningMessage: string | null, workflowWarning: string) {
  if (!warningMessage) {
    return null;
  }

  const normalizedWorkflowWarning = workflowWarning.trim();
  if (!normalizedWorkflowWarning) {
    return warningMessage;
  }

  const filteredParts = warningMessage
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== normalizedWorkflowWarning);

  return filteredParts.length ? filteredParts.join(" | ") : null;
}

export function shapeJobDetailsForClient(details: JobDetails | null) {
  if (!details || !shouldHideIntermediateJobFields(details.job.creationMode)) {
    return details;
  }

  return {
    ...details,
    items: details.items.map((item) => {
      const workflowWarning = item.copy?.workflowWarning?.trim() || "";
      return {
        ...item,
        negativePrompt: null,
        copy: null,
        warningMessage: removeWorkflowWarningMessage(item.warningMessage, workflowWarning),
      };
    }),
  };
}

export function getRawJobDetailsForQuery(jobId: string) {
  return readRawJobDetails(jobId);
}

export function getClientSafeJobDetailsForQuery(jobId: string) {
  return readClientSafeJobDetails(jobId);
}

export function getJobDetailsForQuery(jobId: string) {
  return getClientSafeJobDetailsForQuery(jobId);
}

export function getJobDetailsOrThrow(jobId: string) {
  const details = getRawJobDetailsForQuery(jobId);
  if (!details) {
    throw new JobQueryError("Job not found.", 404);
  }

  return details;
}

export function getClientSafeJobDetailsOrThrow(jobId: string) {
  const details = getClientSafeJobDetailsForQuery(jobId);
  if (!details) {
    throw new JobQueryError("Job not found.", 404);
  }

  return details;
}

export function parseJobListFilters(searchParams: URLSearchParams): JobListFilters {
  return {
    search: searchParams.get("search") || undefined,
    status: searchParams.get("status") || undefined,
    platform: searchParams.get("platform") || undefined,
    country: searchParams.get("country") || undefined,
    language: searchParams.get("language") || undefined,
    imageType: searchParams.get("imageType") || undefined,
    resolution: searchParams.get("resolution") || undefined,
    dateFrom: searchParams.get("dateFrom") || undefined,
    dateTo: searchParams.get("dateTo") || undefined,
  };
}

export function listJobsForQuery(filters: JobListFilters) {
  return listJobsByFilters(filters);
}
