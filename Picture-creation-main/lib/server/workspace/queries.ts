import "server-only";

import { networkInterfaces } from "node:os";

import { cache } from "react";

import type { DashboardStats, JobListFilters, JobListSummary } from "@/lib/db";
import { testFeishuConnection } from "@/lib/feishu";
import { testProviderConnection } from "@/lib/gemini";
import { resolveProviderType } from "@/lib/provider-router";
import type { AppSettings, BrandRecord, JobRecord, ServiceDrawerSettings } from "@/lib/types";

import {
  getDashboardStatsSnapshot,
  getSettingsSnapshot,
  listBrandsSnapshot,
  listHistoryJobsByFilters,
  summarizeHistoryJobsByFilters,
} from "./store";

const HISTORY_PAGE_SIZE = 24;
const INTEGRATION_PROBE_TIMEOUT_MS = 4000;
const INTEGRATION_PROBE_TTL_MS = 30_000;
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
  integrations: {
    gemini: "ready" | "partial" | "inactive";
    feishu: "ready" | "partial" | "inactive";
    lan: "ready" | "partial" | "inactive";
  };
}

interface IntegrationProbeCacheEntry {
  fingerprint: string;
  expiresAt: number;
  value: HomePageData["integrations"];
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

export interface HeaderHistorySummary {
  totalJobs: number;
  totalGenerated: number;
  totalSucceeded: number;
  totalFailed: number;
}

export interface SettingsPageData {
  settings: AppSettings;
  brands: BrandRecord[];
}

let integrationProbeCache: IntegrationProbeCacheEntry | null = null;
let integrationProbePromise: Promise<HomePageData["integrations"]> | null = null;

export function clearIntegrationProbeCache() {
  integrationProbeCache = null;
  integrationProbePromise = null;
}

const readHomePageData = cache(async (): Promise<HomePageData> => {
  const settings = getSettingsSnapshot();

  return {
    stats: getDashboardStatsSnapshot(),
    integrations: await getIntegrationProbeSnapshot(settings),
  };
});

const readSettingsPageData = cache((): SettingsPageData => ({
  settings: getSettingsSnapshot(),
  brands: listBrandsSnapshot(),
}));

const readServiceDrawerSettings = cache((): ServiceDrawerSettings => redactSettingsForServiceDrawer(getSettingsSnapshot()));

const readHistoryHeaderSummary = cache((): HeaderHistorySummary => {
  const summary = summarizeHistoryJobsByFilters({});

  return {
    totalJobs: summary.totalJobs,
    totalGenerated: summary.totalGenerated,
    totalSucceeded: summary.totalSucceeded,
    totalFailed: summary.totalFailed,
  };
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

export function getServiceDrawerSettingsForQuery(): ServiceDrawerSettings {
  return readServiceDrawerSettings();
}

export function redactSettingsForServiceDrawer(settings: AppSettings): ServiceDrawerSettings {
  return {
    ...settings,
    defaultApiKey: "",
    defaultApiHeaders: "",
    feishuAppSecret: "",
    feishuFieldMappingJson: "{}",
    agentSettingsJson: "{}",
    hasExistingDefaultApiKey: Boolean(settings.defaultApiKey.trim()),
    hasExistingDefaultApiHeaders: Boolean(settings.defaultApiHeaders.trim()),
    hasExistingFeishuAppSecret: Boolean(settings.feishuAppSecret.trim()),
  };
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

async function getIntegrationProbeSnapshot(settings: AppSettings): Promise<HomePageData["integrations"]> {
  const fingerprint = createIntegrationFingerprint(settings);
  const now = Date.now();

  if (
    integrationProbeCache &&
    integrationProbeCache.fingerprint === fingerprint &&
    integrationProbeCache.expiresAt > now
  ) {
    return integrationProbeCache.value;
  }

  if (!integrationProbePromise) {
    integrationProbePromise = (async () => {
      const [api, feishu] = await Promise.all([
        probeApiIntegration(settings),
        probeFeishuIntegration(settings),
      ]);
      const value = {
        gemini: api,
        feishu,
        lan: probeLanIntegration(),
      } satisfies HomePageData["integrations"];

      integrationProbeCache = {
        fingerprint,
        expiresAt: Date.now() + INTEGRATION_PROBE_TTL_MS,
        value,
      };

      return value;
    })().finally(() => {
      integrationProbePromise = null;
    });
  }

  return integrationProbePromise;
}

function createIntegrationFingerprint(settings: AppSettings) {
  return JSON.stringify({
    defaultProvider: settings.defaultProvider,
    defaultApiKey: settings.defaultApiKey,
    defaultTextModel: settings.defaultTextModel,
    defaultApiBaseUrl: settings.defaultApiBaseUrl,
    defaultApiVersion: settings.defaultApiVersion,
    defaultApiHeaders: settings.defaultApiHeaders,
    feishuSyncEnabled: settings.feishuSyncEnabled,
    feishuAppId: settings.feishuAppId,
    feishuAppSecret: settings.feishuAppSecret,
    feishuBitableAppToken: settings.feishuBitableAppToken,
    feishuBitableTableId: settings.feishuBitableTableId,
    feishuUploadParentType: settings.feishuUploadParentType,
    feishuFieldMappingJson: settings.feishuFieldMappingJson,
    hostname: process.env.HOSTNAME,
  });
}

async function probeApiIntegration(settings: AppSettings): Promise<"ready" | "partial" | "inactive"> {
  if (!settings.defaultApiKey.trim() || !settings.defaultTextModel.trim()) {
    return "inactive";
  }

  try {
    if (resolveProviderType(settings.defaultProvider) === "openai") {
      const { testOpenAIConnection } = await import("@/lib/openai-provider");
      await withProbeTimeout(
        testOpenAIConnection({
          apiKey: settings.defaultApiKey,
          textModel: settings.defaultTextModel,
          apiBaseUrl: settings.defaultApiBaseUrl,
          apiHeaders: settings.defaultApiHeaders,
        }),
      );
    } else {
      await withProbeTimeout(
        testProviderConnection({
          apiKey: settings.defaultApiKey,
          textModel: settings.defaultTextModel,
          apiBaseUrl: settings.defaultApiBaseUrl,
          apiVersion: settings.defaultApiVersion,
          apiHeaders: settings.defaultApiHeaders,
        }),
      );
    }
    return "ready";
  } catch {
    return "partial";
  }
}

async function probeFeishuIntegration(settings: AppSettings): Promise<"ready" | "partial" | "inactive"> {
  const hasRequiredFields =
    Boolean(settings.feishuAppId.trim()) &&
    Boolean(settings.feishuAppSecret.trim()) &&
    Boolean(settings.feishuBitableAppToken.trim()) &&
    Boolean(settings.feishuBitableTableId.trim());

  if (!settings.feishuSyncEnabled && !hasRequiredFields) {
    return "inactive";
  }

  if (!hasRequiredFields) {
    return "partial";
  }

  try {
    await withProbeTimeout(testFeishuConnection(settings));
    return "ready";
  } catch {
    return "partial";
  }
}

function probeLanIntegration(): "ready" | "partial" | "inactive" {
  const lanAddresses = listPrivateLanAddresses();
  if (lanAddresses.length === 0) {
    return "inactive";
  }

  const bindHost = normalizeBindHost(process.env.HOSTNAME);
  if (bindHost && LOOPBACK_HOSTS.has(bindHost)) {
    return "partial";
  }

  return "ready";
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function normalizeBindHost(hostname: string | undefined) {
  return hostname?.trim().toLowerCase() ?? "";
}

function listPrivateLanAddresses() {
  const interfaces = networkInterfaces();
  const addresses: string[] = [];

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") {
        continue;
      }

      if (isPrivateIPv4(entry.address)) {
        addresses.push(entry.address);
      }
    }
  }

  return addresses;
}

function isPrivateIPv4(address: string) {
  return (
    address.startsWith("10.") ||
    address.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  );
}

async function withProbeTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Integration probe timed out.")), INTEGRATION_PROBE_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
