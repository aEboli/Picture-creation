import type { AgentId, AgentProfileSettings, AgentSettingsStore } from "@/lib/types";

export const DEFAULT_AGENT_SETTINGS_STORE: AgentSettingsStore = {
  "image-analyst": {
    name: "图片分析师",
    description: "基于图片和当前上下文，提炼主体、材质、结构和卖点信息。",
    systemPrompt: [
      "You are an objective ecommerce image analyst for a create-page form assistant.",
      "Describe only what is visible or strongly inferable from the user text and optional image.",
      "Do not invent ungrounded claims. If unsure, be explicit about uncertainty.",
      "Keep the answer concise and useful for product content drafting.",
      "Always return JSON only.",
      "Field mapping should be best-effort and may leave unknown fields as empty strings.",
    ].join("\n"),
    openingPrompt: "例如：分析一下这个主体，提炼材质、结构和卖点。",
  },
  "prompt-engineer": {
    name: "提示词工程师",
    description: "基于商品信息和图片上下文，输出更有营销感的提示词与结构化建议。",
    systemPrompt: [
      "You are a concise prompt-engineering assistant for ecommerce image generation.",
      "Give practical, short guidance that improves prompt quality and fillable create-form details.",
      "When enough context is available, provide up to 3 distinct ready-to-use prompt suggestions.",
      "Keep the response actionable and avoid long essays.",
      "Always return JSON only.",
      "Field mapping should be best-effort and may leave unknown fields as empty strings.",
    ].join("\n"),
    openingPrompt: "例如：基于这张图，帮我写一个更有营销感的场景图提示词。",
  },
};

const KNOWN_AGENT_IDS = Object.keys(DEFAULT_AGENT_SETTINGS_STORE) as AgentId[];

function isAgentId(value: string): value is AgentId {
  return KNOWN_AGENT_IDS.includes(value as AgentId);
}

function normalizeAgentProfileSettings(
  raw: unknown,
  fallback: AgentProfileSettings,
): AgentProfileSettings {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...fallback };
  }

  const candidate = raw as Partial<Record<keyof AgentProfileSettings, unknown>>;

  return {
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : fallback.name,
    description:
      typeof candidate.description === "string" && candidate.description.trim()
        ? candidate.description.trim()
        : fallback.description,
    systemPrompt:
      typeof candidate.systemPrompt === "string" && candidate.systemPrompt.trim()
        ? candidate.systemPrompt
        : fallback.systemPrompt,
    openingPrompt:
      typeof candidate.openingPrompt === "string" && candidate.openingPrompt.trim()
        ? candidate.openingPrompt.trim()
        : fallback.openingPrompt,
  };
}

export function resolveAgentSettingsStore(rawJson: string | null | undefined): AgentSettingsStore {
  if (!rawJson?.trim()) {
    return { ...DEFAULT_AGENT_SETTINGS_STORE };
  }

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    return {
      "image-analyst": normalizeAgentProfileSettings(parsed["image-analyst"], DEFAULT_AGENT_SETTINGS_STORE["image-analyst"]),
      "prompt-engineer": normalizeAgentProfileSettings(parsed["prompt-engineer"], DEFAULT_AGENT_SETTINGS_STORE["prompt-engineer"]),
    };
  } catch {
    return { ...DEFAULT_AGENT_SETTINGS_STORE };
  }
}

export function resolveAgentProfileSettings(rawJson: string | null | undefined, agentId: AgentId): AgentProfileSettings {
  return resolveAgentSettingsStore(rawJson)[agentId];
}

export function sanitizeAgentSettingsUpdate(input: unknown): Partial<Record<AgentId, AgentProfileSettings>> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Agent settings payload must be an object.");
  }

  const candidate = input as Record<string, unknown>;
  const sanitized: Partial<Record<AgentId, AgentProfileSettings>> = {};

  for (const [key, value] of Object.entries(candidate)) {
    if (!isAgentId(key)) {
      throw new Error(`Unknown agent id: ${key}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Agent settings for ${key} must be an object.`);
    }

    const profile = value as Partial<Record<keyof AgentProfileSettings, unknown>>;
    const nextProfile: AgentProfileSettings = {
      name: typeof profile.name === "string" ? profile.name : "",
      description: typeof profile.description === "string" ? profile.description : "",
      systemPrompt: typeof profile.systemPrompt === "string" ? profile.systemPrompt : "",
      openingPrompt: typeof profile.openingPrompt === "string" ? profile.openingPrompt : "",
    };

    if (
      typeof profile.name !== "string" ||
      typeof profile.description !== "string" ||
      typeof profile.systemPrompt !== "string" ||
      typeof profile.openingPrompt !== "string"
    ) {
      throw new Error(`Agent settings for ${key} must contain string fields only.`);
    }

    sanitized[key] = nextProfile;
  }

  return sanitized;
}

export function mergeAgentSettingsStore(
  currentStore: AgentSettingsStore,
  patch: Partial<Record<AgentId, AgentProfileSettings>>,
): AgentSettingsStore {
  return {
    "image-analyst": patch["image-analyst"] ?? currentStore["image-analyst"],
    "prompt-engineer": patch["prompt-engineer"] ?? currentStore["prompt-engineer"],
  };
}

export function serializeAgentSettingsStore(store: AgentSettingsStore) {
  return JSON.stringify(store);
}
