import "server-only";

import { cache } from "react";

import {
  mergeAgentSettingsStore,
  resolveAgentSettingsStore,
  sanitizeAgentSettingsUpdate,
  serializeAgentSettingsStore,
} from "@/lib/agent-settings";
import type { AgentId, AgentProfileSettings, AgentSettingsStore } from "@/lib/types";

import { getSettingsSnapshot, updateSettingsSnapshot } from "@/lib/server/settings/store";

export class AgentSettingsServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentSettingsServiceError";
    this.status = status;
  }
}

const readAgentSettingsSnapshot = cache((): AgentSettingsStore => {
  return resolveAgentSettingsStore(getSettingsSnapshot().agentSettingsJson);
});

export function getAgentSettingsForQuery(): AgentSettingsStore {
  return readAgentSettingsSnapshot();
}

export function updateAgentSettingsFromInput(
  input: Partial<Record<AgentId, AgentProfileSettings>> | null | undefined,
): AgentSettingsStore {
  try {
    const patch = sanitizeAgentSettingsUpdate(input ?? {});
    const currentStore = resolveAgentSettingsStore(getSettingsSnapshot().agentSettingsJson);
    const nextStore = mergeAgentSettingsStore(currentStore, patch);
    updateSettingsSnapshot({
      agentSettingsJson: serializeAgentSettingsStore(nextStore),
    });
    return nextStore;
  } catch (error) {
    throw new AgentSettingsServiceError(error instanceof Error ? error.message : "Invalid agent settings.", 400);
  }
}
