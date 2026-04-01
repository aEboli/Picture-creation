import "server-only";

import {
  probeRuntimeIntegrations,
  readRuntimeHeaderSummary,
  readRuntimeIntegrationSeed,
} from "./header-snapshot-store";
import type { RuntimeHeaderIntegrations, RuntimeHeaderSnapshot, RuntimeHeaderSummary } from "./header-snapshot-types";

const INTEGRATIONS_TTL_MS = 30_000;
const SUMMARY_TTL_MS = 10_000;

interface RuntimeHeaderSnapshotState {
  summaryRefreshedAt: number;
  integrationsRefreshedAt: number;
  snapshot: RuntimeHeaderSnapshot;
}

interface RuntimeHeaderSnapshotDeps {
  now: () => number;
  readSummary: () => RuntimeHeaderSummary;
  readIntegrationSeed: () => RuntimeHeaderIntegrations;
  probeIntegrations: (previous: RuntimeHeaderIntegrations) => Promise<RuntimeHeaderIntegrations>;
}

interface RefreshFlags {
  refreshSummary: boolean;
  refreshIntegrations: boolean;
}

interface RuntimeHeaderSnapshotService {
  getSnapshot: () => RuntimeHeaderSnapshot;
}

const defaultDeps: RuntimeHeaderSnapshotDeps = {
  now: () => Date.now(),
  readSummary: readRuntimeHeaderSummary,
  readIntegrationSeed: readRuntimeIntegrationSeed,
  probeIntegrations: probeRuntimeIntegrations,
};

export function createRuntimeHeaderSnapshotService(
  deps: RuntimeHeaderSnapshotDeps = defaultDeps,
): RuntimeHeaderSnapshotService {
  let state: RuntimeHeaderSnapshotState | null = null;
  let refreshPromise: Promise<void> | null = null;

  function getSnapshot(): RuntimeHeaderSnapshot {
    if (!state) {
      state = createSeedState(deps);
      triggerRefresh({ refreshSummary: false, refreshIntegrations: true });
    }

    const flags = getRefreshFlags(state, deps.now());
    if (flags.refreshSummary || flags.refreshIntegrations) {
      triggerRefresh(flags);
    }

    return formatSnapshot(state, deps.now());
  }

  function triggerRefresh(flags: RefreshFlags) {
    if (refreshPromise || !state) {
      return;
    }

    refreshPromise = Promise.resolve()
      .then(() => refreshState(flags))
      .finally(() => {
        refreshPromise = null;
      });
  }

  async function refreshState(flags: RefreshFlags) {
    if (!state) {
      state = createSeedState(deps);
    }

    const current = state;
    let nextSummary = current.snapshot.summary;
    let nextIntegrations = current.snapshot.integrations;
    let nextSummaryRefreshedAt = current.summaryRefreshedAt;
    let nextIntegrationsRefreshedAt = current.integrationsRefreshedAt;

    if (flags.refreshSummary) {
      try {
        nextSummary = deps.readSummary();
        nextSummaryRefreshedAt = deps.now();
      } catch {
        // Keep previous successful summary when refresh fails.
      }
    }

    if (flags.refreshIntegrations) {
      try {
        nextIntegrations = await deps.probeIntegrations(current.snapshot.integrations);
        nextIntegrationsRefreshedAt = deps.now();
      } catch {
        // Keep previous successful integrations when refresh probe fails.
      }
    }

    const refreshedAt = Math.max(nextSummaryRefreshedAt, nextIntegrationsRefreshedAt);
    state = {
      summaryRefreshedAt: nextSummaryRefreshedAt,
      integrationsRefreshedAt: nextIntegrationsRefreshedAt,
      snapshot: {
        integrations: nextIntegrations,
        summary: nextSummary,
        refreshedAt: new Date(refreshedAt).toISOString(),
        stale: false,
      },
    };
  }

  return {
    getSnapshot,
  };
}

const runtimeHeaderSnapshotService = createRuntimeHeaderSnapshotService();

export function getRuntimeHeaderSnapshot(): RuntimeHeaderSnapshot {
  return runtimeHeaderSnapshotService.getSnapshot();
}

function createSeedState(deps: RuntimeHeaderSnapshotDeps): RuntimeHeaderSnapshotState {
  const now = deps.now();
  const summary = safeReadSummary(deps);
  const integrations = safeReadIntegrationSeed(deps);

  return {
    summaryRefreshedAt: now,
    integrationsRefreshedAt: 0,
    snapshot: {
      integrations,
      summary,
      refreshedAt: new Date(now).toISOString(),
      stale: true,
    },
  };
}

function safeReadSummary(deps: RuntimeHeaderSnapshotDeps): RuntimeHeaderSummary {
  try {
    return deps.readSummary();
  } catch {
    return {
      totalJobs: 0,
      totalGenerated: 0,
      totalSucceeded: 0,
      totalFailed: 0,
    };
  }
}

function safeReadIntegrationSeed(deps: RuntimeHeaderSnapshotDeps): RuntimeHeaderIntegrations {
  try {
    return deps.readIntegrationSeed();
  } catch {
    return {
      gemini: "inactive",
      feishu: "inactive",
      lan: "inactive",
    };
  }
}

function getRefreshFlags(state: RuntimeHeaderSnapshotState, now: number): RefreshFlags {
  return {
    refreshSummary: now - state.summaryRefreshedAt >= SUMMARY_TTL_MS,
    refreshIntegrations:
      state.integrationsRefreshedAt === 0 || now - state.integrationsRefreshedAt >= INTEGRATIONS_TTL_MS,
  };
}

function formatSnapshot(state: RuntimeHeaderSnapshotState, now: number): RuntimeHeaderSnapshot {
  const stale =
    now - state.summaryRefreshedAt >= SUMMARY_TTL_MS ||
    state.integrationsRefreshedAt === 0 ||
    now - state.integrationsRefreshedAt >= INTEGRATIONS_TTL_MS;

  return {
    integrations: state.snapshot.integrations,
    summary: state.snapshot.summary,
    refreshedAt: state.snapshot.refreshedAt,
    stale,
  };
}
