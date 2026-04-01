import "server-only";

import { networkInterfaces } from "node:os";

import { testFeishuConnection } from "@/lib/feishu";
import { testProviderConnection } from "@/lib/gemini";
import type { AppSettings } from "@/lib/types";
import { getSettingsSnapshot, summarizeHistoryJobsByFilters } from "@/lib/server/workspace/store";

import type { RuntimeHeaderIntegrations, RuntimeHeaderSummary, RuntimeIntegrationState } from "./header-snapshot-types";

const INTEGRATION_PROBE_TIMEOUT_MS = 4000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function readRuntimeHeaderSummary(): RuntimeHeaderSummary {
  const summary = summarizeHistoryJobsByFilters({});

  return {
    totalJobs: summary.totalJobs,
    totalGenerated: summary.totalGenerated,
    totalSucceeded: summary.totalSucceeded,
    totalFailed: summary.totalFailed,
  };
}

export function readRuntimeIntegrationSeed(): RuntimeHeaderIntegrations {
  const settings = getSettingsSnapshot();

  return {
    gemini: settings.defaultApiKey.trim() && settings.defaultTextModel.trim() ? "partial" : "inactive",
    feishu: resolveFeishuSeedState(settings),
    lan: probeLanIntegration(),
  };
}

export async function probeRuntimeIntegrations(
  previous: RuntimeHeaderIntegrations,
): Promise<RuntimeHeaderIntegrations> {
  const settings = getSettingsSnapshot();
  const [gemini, feishu] = await Promise.all([
    probeGeminiIntegration(settings, previous.gemini),
    probeFeishuIntegration(settings, previous.feishu),
  ]);

  return {
    gemini,
    feishu,
    lan: probeLanIntegration(),
  };
}

async function probeGeminiIntegration(
  settings: AppSettings,
  fallback: RuntimeIntegrationState,
): Promise<RuntimeIntegrationState> {
  if (!settings.defaultApiKey.trim() || !settings.defaultTextModel.trim()) {
    return "inactive";
  }

  try {
    await withProbeTimeout(
      testProviderConnection({
        apiKey: settings.defaultApiKey,
        textModel: settings.defaultTextModel,
        apiBaseUrl: settings.defaultApiBaseUrl,
        apiVersion: settings.defaultApiVersion,
        apiHeaders: settings.defaultApiHeaders,
      }),
    );
    return "ready";
  } catch {
    return fallback;
  }
}

async function probeFeishuIntegration(
  settings: AppSettings,
  fallback: RuntimeIntegrationState,
): Promise<RuntimeIntegrationState> {
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
    return fallback;
  }
}

function resolveFeishuSeedState(settings: AppSettings): RuntimeIntegrationState {
  const hasRequiredFields =
    Boolean(settings.feishuAppId.trim()) &&
    Boolean(settings.feishuAppSecret.trim()) &&
    Boolean(settings.feishuBitableAppToken.trim()) &&
    Boolean(settings.feishuBitableTableId.trim());

  if (!settings.feishuSyncEnabled && !hasRequiredFields) {
    return "inactive";
  }

  return "partial";
}

function probeLanIntegration(): RuntimeIntegrationState {
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
