import "server-only";

import {
  getDashboardStats,
  getSettings,
  listBrands,
  listJobs,
  listRecentJobs,
  summarizeJobs,
} from "@/lib/db";
import type { DashboardStats, JobListFilters, JobListSummary } from "@/lib/db";
import type { AppSettings, BrandRecord, JobRecord } from "@/lib/types";

export function getDashboardStatsSnapshot(): DashboardStats {
  return getDashboardStats();
}

export function listRecentJobsSnapshot(limit: number): JobRecord[] {
  return listRecentJobs(limit);
}

export function summarizeHistoryJobsByFilters(filters: JobListFilters): JobListSummary {
  return summarizeJobs(filters);
}

export function listHistoryJobsByFilters(
  filters: JobListFilters,
  options: { limit?: number; offset?: number },
): JobRecord[] {
  return listJobs(filters, options);
}

export function getSettingsSnapshot(): AppSettings {
  return getSettings();
}

export function listBrandsSnapshot(): BrandRecord[] {
  return listBrands();
}
