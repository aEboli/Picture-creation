export type AgentType = "image-analyst" | "prompt-engineer";

export type CreateAgentMappedFields = {
  productName?: string;
  sellingPoints?: string;
  materialInfo?: string;
  sizeInfo?: string;
  brandName?: string;
};

export type CreateAgentMapDetail = {
  agentType: AgentType;
  fields?: CreateAgentMappedFields;
  promptSuggestions?: string[];
};

export type PersistedCreateAgentMessage = {
  id: string;
  role: "user" | "agent";
  agent: AgentType;
  text: string;
  createdAt: string;
  fields?: CreateAgentMappedFields;
  promptSuggestions?: string[];
  previewDataUrl?: string;
};

export const CREATE_JOB_DRAFT_KEY = "commerce-image-studio.create-draft.v1";
export const CREATE_AGENT_HISTORY_KEY = "commerce-image-studio.create-agent-history.v1";
export const CREATE_AGENT_DRAFT_CONTEXT_EVENT = "create-agent:draft-context";

export function createCreateDraftId() {
  return `draft_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

export function readCreateDraftIdFromDraftJson(rawDraft: string | null) {
  if (!rawDraft?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawDraft) as { draftId?: unknown };
    return typeof parsed?.draftId === "string" && parsed.draftId.trim() ? parsed.draftId.trim() : null;
  } catch {
    return null;
  }
}

function normalizeMappedFields(raw: unknown): CreateAgentMappedFields | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const normalizedEntries = Object.entries(raw).filter(([key, value]) => {
    return (
      ["productName", "sellingPoints", "materialInfo", "sizeInfo", "brandName"].includes(key) &&
      typeof value === "string" &&
      value.trim()
    );
  });

  if (!normalizedEntries.length) {
    return undefined;
  }

  return Object.fromEntries(normalizedEntries.map(([key, value]) => [key, (value as string).trim()]));
}

function normalizePromptSuggestions(raw: unknown) {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const normalized = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  return normalized.length ? normalized : undefined;
}

function normalizePreviewDataUrl(raw: unknown) {
  return typeof raw === "string" && raw.startsWith("data:image/") ? raw : undefined;
}

export function normalizeAgentHistoryMessages(raw: unknown): PersistedCreateAgentMessage[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const id = typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id.trim() : "";
    const role = typeof (item as { role?: unknown }).role === "string" ? (item as { role: string }).role.trim() : "";
    const agent = typeof (item as { agent?: unknown }).agent === "string" ? (item as { agent: string }).agent.trim() : "";
    const text = typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text.trim() : "";
    const createdAt =
      typeof (item as { createdAt?: unknown }).createdAt === "string" ? (item as { createdAt: string }).createdAt.trim() : "";

    const previewDataUrl = normalizePreviewDataUrl((item as { previewDataUrl?: unknown }).previewDataUrl);

    if (
      !id ||
      (role !== "user" && role !== "agent") ||
      (agent !== "image-analyst" && agent !== "prompt-engineer") ||
      (!text && !previewDataUrl) ||
      !createdAt
    ) {
      return [];
    }

    const normalizedFields = normalizeMappedFields((item as { fields?: unknown }).fields);
    const promptSuggestions = normalizePromptSuggestions((item as { promptSuggestions?: unknown }).promptSuggestions);

    return [
      {
        id,
        role: role as PersistedCreateAgentMessage["role"],
        agent: agent as AgentType,
        text,
        createdAt,
        ...(normalizedFields ? { fields: normalizedFields } : {}),
        ...(promptSuggestions ? { promptSuggestions } : {}),
        ...(previewDataUrl ? { previewDataUrl } : {}),
      },
    ];
  });
}

function parseHistoryStore(rawStore: string | null): Record<string, PersistedCreateAgentMessage[]> {
  if (!rawStore?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawStore) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([draftId, messages]) => [draftId, normalizeAgentHistoryMessages(messages)]),
    );
  } catch {
    return {};
  }
}

type DraftHistoryBuckets = Partial<Record<AgentType, PersistedCreateAgentMessage[]>>;

function parseHistoryBuckets(rawStore: string | null): Record<string, DraftHistoryBuckets> {
  if (!rawStore?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawStore) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([draftId, buckets]) => {
        if (Array.isArray(buckets)) {
          return [draftId, { "image-analyst": normalizeAgentHistoryMessages(buckets) }];
        }

        if (!buckets || typeof buckets !== "object") {
          return [draftId, {}];
        }

        return [
          draftId,
          {
            "image-analyst": normalizeAgentHistoryMessages((buckets as DraftHistoryBuckets)["image-analyst"]),
            "prompt-engineer": normalizeAgentHistoryMessages((buckets as DraftHistoryBuckets)["prompt-engineer"]),
          },
        ];
      }),
    );
  } catch {
    return {};
  }
}

export function readAgentHistoryBucket(rawStore: string | null, draftId: string, agentType: AgentType): PersistedCreateAgentMessage[] {
  if (!draftId.trim()) {
    return [];
  }

  const store = parseHistoryBuckets(rawStore);
  return store[draftId]?.[agentType] ?? [];
}

export function writeAgentHistoryBucket(
  rawStore: string | null,
  draftId: string,
  agentType: AgentType,
  messages: PersistedCreateAgentMessage[],
) {
  const store = parseHistoryBuckets(rawStore);
  const nextBuckets = store[draftId] ?? {};
  nextBuckets[agentType] = normalizeAgentHistoryMessages(messages);
  store[draftId] = nextBuckets;
  return JSON.stringify(store);
}
