import "server-only";

import { cache } from "react";

import type { DashboardStats, JobListFilters, JobListSummary } from "@/lib/db";
import { getRuntimeHeaderSnapshot } from "@/lib/server/runtime/header-snapshot-service";
import type { RuntimeHeaderIntegrations, RuntimeHeaderSummary } from "@/lib/server/runtime/header-snapshot-types";
import type { AppSettings, BrandRecord, JobRecord } from "@/lib/types";

import {
  getDashboardStatsSnapshot,
  getSettingsSnapshot,
  listBrandsSnapshot,
  listHistoryJobsByFilters,
  summarizeHistoryJobsByFilters,
} from "./store";

const HISTORY_PAGE_SIZE = 24;
const HISTORY_PARAM_KEYS = [
  "search",
  "status",
  "platform",
  "country",
  "marketLanguage",
  "resolution",
  "dateFrom",
  "dateTo",
  "page",
] as const;

export interface HomePageData {
  stats: DashboardStats;
  integrations: RuntimeHeaderIntegrations;
}

export interface HistoryPageSearchParams {
  [key: string]: string | string[] | undefined;
}

export interface HistoryFormValues {
  search: string;
  status: string;
  platform: string;
  country: string;
  marketLanguage: string;
  resolution: string;
  dateFrom: string;
  dateTo: string;
}

export interface HistoryPageLink {
  href: string;
  isCurrent: boolean;
  pageNumber: number;
}

export interface HistoryPageData {
  filters: JobListFilters;
  formValues: HistoryFormValues;
  summary: JobListSummary;
  jobs: JobRecord[];
  currentPage: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  previousHref: string;
  nextHref: string;
  firstPageHref: string | null;
  lastPageHref: string | null;
  showLeadingEllipsis: boolean;
  showTrailingEllipsis: boolean;
  pageLinks: HistoryPageLink[];
}

export type HeaderHistorySummary = RuntimeHeaderSummary;

export interface SettingsPageData {
  settings: AppSettings;
  brands: BrandRecord[];
}

const readHomePageData = cache((): HomePageData => {
  const snapshot = getRuntimeHeaderSnapshot();

  return {
    stats: getDashboardStatsSnapshot(),
    integrations: snapshot.integrations,
  };
});

const readSettingsPageData = cache((): SettingsPageData => ({
  settings: getSettingsSnapshot(),
  brands: listBrandsSnapshot(),
}));

const readHistoryHeaderSummary = cache((): HeaderHistorySummary => {
  const snapshot = getRuntimeHeaderSnapshot();
  return snapshot.summary;
});

const readHistoryPageData = cache((queryString: string): HistoryPageData => {
  const search = new URLSearchParams(queryString);
  const filters: JobListFilters = {
    search: search.get("search") || undefined,
    status: search.get("status") || undefined,
    platform: search.get("platform") || undefined,
    country: search.get("country") || undefined,
    language: search.get("marketLanguage") || undefined,
    resolution: search.get("resolution") || undefined,
    dateFrom: search.get("dateFrom") || undefined,
    dateTo: search.get("dateTo") || undefined,
  };

  const summary = summarizeHistoryJobsByFilters(filters);
  const totalPages = Math.max(1, Math.ceil(summary.totalJobs / HISTORY_PAGE_SIZE));
  const currentPage = Math.min(parsePage(search.get("page")), totalPages);
  const jobs = listHistoryJobsByFilters(filters, {
    limit: HISTORY_PAGE_SIZE,
    offset: (currentPage - 1) * HISTORY_PAGE_SIZE,
  });
  const rangeStart = summary.totalJobs ? (currentPage - 1) * HISTORY_PAGE_SIZE + 1 : 0;
  const rangeEnd = summary.totalJobs ? Math.min((currentPage - 1) * HISTORY_PAGE_SIZE + jobs.length, summary.totalJobs) : 0;
  const paginationWindowStart = Math.max(1, currentPage - 1);
  const paginationWindowEnd = Math.min(totalPages, currentPage + 1);
  const pageLinks = Array.from({ length: paginationWindowEnd - paginationWindowStart + 1 }, (_, index) => {
    const pageNumber = paginationWindowStart + index;
    return {
      href: buildHistoryHref(queryString, pageNumber),
      isCurrent: pageNumber === currentPage,
      pageNumber,
    };
  });

  return {
    filters,
    formValues: {
      search: search.get("search") || "",
      status: search.get("status") || "",
      platform: search.get("platform") || "",
      country: search.get("country") || "",
      marketLanguage: search.get("marketLanguage") || "",
      resolution: search.get("resolution") || "",
      dateFrom: search.get("dateFrom") || "",
      dateTo: search.get("dateTo") || "",
    },
    summary,
    jobs,
    currentPage,
    totalPages,
    rangeStart,
    rangeEnd,
    previousHref: buildHistoryHref(queryString, Math.max(1, currentPage - 1)),
    nextHref: buildHistoryHref(queryString, Math.min(totalPages, currentPage + 1)),
    firstPageHref: paginationWindowStart > 1 ? buildHistoryHref(queryString, 1) : null,
    lastPageHref: paginationWindowEnd < totalPages ? buildHistoryHref(queryString, totalPages) : null,
    showLeadingEllipsis: paginationWindowStart > 2,
    showTrailingEllipsis: paginationWindowEnd < totalPages - 1,
    pageLinks,
  };
});

export async function getHomePageData(): Promise<HomePageData> {
  return readHomePageData();
}

export function getHistoryPageData(searchParams: HistoryPageSearchParams): HistoryPageData {
  return readHistoryPageData(createHistoryQueryString(searchParams));
}

export function getHistoryHeaderSummary(): HeaderHistorySummary {
  return readHistoryHeaderSummary();
}

export function getSettingsPageData(): SettingsPageData {
  return readSettingsPageData();
}

function createHistoryQueryString(searchParams: HistoryPageSearchParams): string {
  const normalized = new URLSearchParams();

  for (const key of HISTORY_PARAM_KEYS) {
    const value = readStringParam(searchParams, key);
    if (value) {
      normalized.set(key, value);
    }
  }

  return normalized.toString();
}

function readStringParam(searchParams: HistoryPageSearchParams, key: string): string | undefined {
  return typeof searchParams[key] === "string" ? searchParams[key] : undefined;
}

function parsePage(value: string | null): number {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function buildHistoryHref(queryString: string, page: number): string {
  const search = new URLSearchParams(queryString);

  if (page > 1) {
    search.set("page", String(page));
  } else {
    search.delete("page");
  }

  const nextQuery = search.toString();
  return nextQuery ? `/history?${nextQuery}` : "/history";
}
