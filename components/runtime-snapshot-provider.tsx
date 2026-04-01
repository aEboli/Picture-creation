"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type IntegrationState = "ready" | "partial" | "inactive";

export type RuntimeSnapshot = {
  integrations: {
    gemini: IntegrationState;
    feishu: IntegrationState;
    lan: IntegrationState;
  };
  summary: {
    totalJobs: number;
    totalGenerated: number;
    totalSucceeded: number;
    totalFailed: number;
  };
  refreshedAt: string | null;
  stale: boolean;
};

type RuntimeSnapshotContextValue = {
  snapshot: RuntimeSnapshot;
  refreshSnapshot: () => Promise<void>;
};

const RuntimeSnapshotContext = createContext<RuntimeSnapshotContextValue | null>(null);

export function getDefaultRuntimeSnapshotSeed(): RuntimeSnapshot {
  return {
    integrations: {
      gemini: "inactive",
      feishu: "inactive",
      lan: "inactive",
    },
    summary: {
      totalJobs: 0,
      totalGenerated: 0,
      totalSucceeded: 0,
      totalFailed: 0,
    },
    refreshedAt: null,
    stale: true,
  };
}

function normalizeCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function normalizeIntegrationState(value: unknown): IntegrationState {
  if (value === "ready" || value === "partial" || value === "inactive") {
    return value;
  }

  return "inactive";
}

function normalizeSnapshot(candidate: unknown, fallback: RuntimeSnapshot): RuntimeSnapshot {
  if (!candidate || typeof candidate !== "object") {
    return {
      ...fallback,
      stale: true,
    };
  }

  const payload = candidate as Record<string, unknown>;
  const integrations = payload.integrations as Record<string, unknown> | undefined;
  const summary = payload.summary as Record<string, unknown> | undefined;

  return {
    integrations: {
      gemini: normalizeIntegrationState(integrations?.gemini),
      feishu: normalizeIntegrationState(integrations?.feishu),
      lan: normalizeIntegrationState(integrations?.lan),
    },
    summary: {
      totalJobs: normalizeCount(summary?.totalJobs),
      totalGenerated: normalizeCount(summary?.totalGenerated),
      totalSucceeded: normalizeCount(summary?.totalSucceeded),
      totalFailed: normalizeCount(summary?.totalFailed),
    },
    refreshedAt: typeof payload.refreshedAt === "string" ? payload.refreshedAt : null,
    stale: typeof payload.stale === "boolean" ? payload.stale : true,
  };
}

export function RuntimeSnapshotProvider({
  children,
  seedSnapshot,
}: {
  children: ReactNode;
  seedSnapshot: RuntimeSnapshot;
}) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>(seedSnapshot);
  const mountedRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);

  const refreshSnapshot = useCallback(async () => {
    try {
      const response = await fetch("/api/runtime/header-snapshot", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`runtime snapshot request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      if (!mountedRef.current) {
        return;
      }

      setSnapshot((current) => normalizeSnapshot(payload, current));
    } catch {
      if (!mountedRef.current) {
        return;
      }

      setSnapshot((current) => ({
        ...current,
        stale: true,
      }));
    }
  }, []);

  const stopPolling = useCallback(() => {
    const pollTimer = pollTimerRef.current;
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (document.hidden || pollTimerRef.current !== null) {
      return;
    }

    pollTimerRef.current = window.setInterval(() => {
      void refreshSnapshot();
    }, 30_000);
  }, [refreshSnapshot]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshSnapshot();
    startPolling();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
        return;
      }

      void refreshSnapshot();
      startPolling();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSnapshot, startPolling, stopPolling]);

  const value = useMemo(
    () => ({
      snapshot,
      refreshSnapshot,
    }),
    [refreshSnapshot, snapshot],
  );

  return <RuntimeSnapshotContext.Provider value={value}>{children}</RuntimeSnapshotContext.Provider>;
}

export function useRuntimeSnapshot() {
  const context = useContext(RuntimeSnapshotContext);
  if (!context) {
    throw new Error("useRuntimeSnapshot must be used within RuntimeSnapshotProvider");
  }

  return context;
}
