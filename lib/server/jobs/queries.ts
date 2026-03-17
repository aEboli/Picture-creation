import "server-only";

import { cache } from "react";

import type { JobListFilters } from "@/lib/db";

import { getJobDetailsById, listJobsByFilters } from "./store";

export class JobQueryError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "JobQueryError";
    this.status = status;
  }
}

const readJobDetails = cache((jobId: string) => getJobDetailsById(jobId));

export function getJobDetailsForQuery(jobId: string) {
  return readJobDetails(jobId);
}

export function getJobDetailsOrThrow(jobId: string) {
  const details = getJobDetailsForQuery(jobId);
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
