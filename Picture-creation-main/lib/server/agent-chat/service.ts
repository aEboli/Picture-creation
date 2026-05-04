import "server-only";

import { GoogleGenAI } from "@google/genai";

import { resolveAgentProfileSettings } from "@/lib/agent-settings";
import { getSettings } from "@/lib/db";
import { resolveProviderEndpoint } from "@/lib/provider-url";

const SUPPORTED_AGENT_TYPES = ["image-analyst", "prompt-engineer"] as const;
type AgentType = (typeof SUPPORTED_AGENT_TYPES)[number];

type ChatHistoryRole = "user" | "assistant";

interface ChatHistoryItem {
  role: ChatHistoryRole;
  text: string;
}

interface AgentChatFieldMapping {
  productName: string;
  sellingPoints: string;
  materialInfo: string;
  sizeInfo: string;
  brandName: string;
}

interface AgentChatResponse {
  assistantText: string;
  fieldMapping: AgentChatFieldMapping;
  promptSuggestions: string[];
}

const AGENT_CHAT_RESPONSE_SCHEMA = {
  type: "object",
  required: ["assistantText", "fieldMapping"],
  properties: {
    assistantText: { type: "string" },
    promptSuggestions: {
      type: "array",
      items: { type: "string" },
    },
    fieldMapping: {
      type: "object",
      properties: {
        productName: { type: "string" },
        sellingPoints: { type: "string" },
        materialInfo: { type: "string" },
        sizeInfo: { type: "string" },
        brandName: { type: "string" },
      },
    },
  },
} as const;

const EMPTY_FIELD_MAPPING: AgentChatFieldMapping = {
  productName: "",
  sellingPoints: "",
  materialInfo: "",
  sizeInfo: "",
  brandName: "",
};

export class AgentChatRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AgentChatRequestError";
    this.status = status;
  }
}

function parseHeadersJson(rawHeaders?: string): Record<string, string> | undefined {
  if (!rawHeaders?.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawHeaders);
  } catch {
    throw new AgentChatRequestError("Custom headers JSON is invalid.", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AgentChatRequestError("Custom headers JSON must be an object.", 400);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new AgentChatRequestError(`Custom header ${key} must be a string value.`, 400);
    }
    headers[key] = value;
  }

  return headers;
}

function normalizeAgentType(rawAgentType: FormDataEntryValue | null): AgentType {
  const value = typeof rawAgentType === "string" ? rawAgentType.trim() : "";
  if ((SUPPORTED_AGENT_TYPES as readonly string[]).includes(value)) {
    return value as AgentType;
  }
  throw new AgentChatRequestError("agentType must be one of: image-analyst, prompt-engineer.", 400);
}

function readRequiredTextField(formData: FormData, key: string) {
  const value = formData.get(key);
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new AgentChatRequestError(`${key} is required.`, 400);
  }
  return text;
}

function parseConversationHistory(formData: FormData): ChatHistoryItem[] {
  const raw =
    formData.get("conversationHistory") ??
    formData.get("localConversationHistory") ??
    formData.get("history");

  if (typeof raw !== "string" || !raw.trim()) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AgentChatRequestError("conversation history must be valid JSON.", 400);
  }

  if (!Array.isArray(parsed)) {
    throw new AgentChatRequestError("conversation history must be a JSON array.", 400);
  }

  const normalized: ChatHistoryItem[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const roleRaw = typeof (item as { role?: unknown }).role === "string" ? (item as { role: string }).role.trim() : "";
    if (roleRaw !== "user" && roleRaw !== "assistant") {
      continue;
    }

    const textRaw = (item as { text?: unknown; content?: unknown }).text ?? (item as { content?: unknown }).content;
    const text = typeof textRaw === "string" ? textRaw.trim() : "";
    if (!text) {
      continue;
    }

    normalized.push({
      role: roleRaw,
      text,
    });
  }

  return normalized;
}

async function readOptionalImage(formData: FormData) {
  const image = formData.get("image");
  if (!(image instanceof File) || image.size <= 0) {
    return null;
  }

  return {
    mimeType: image.type || "image/png",
    data: Buffer.from(await image.arrayBuffer()).toString("base64"),
  };
}

function historyToPromptBlock(history: ChatHistoryItem[]) {
  if (!history.length) {
    return "Conversation history: none.";
  }

  const lines = history.slice(-10).map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.text}`);
  return `Conversation history:\n${lines.join("\n")}`;
}

function buildUserPrompt(input: {
  agentType: AgentType;
  userText: string;
  history: ChatHistoryItem[];
  hasImage: boolean;
}) {
  return [
    `Agent mode: ${input.agentType}.`,
    historyToPromptBlock(input.history),
    `Uploaded image present: ${input.hasImage ? "yes" : "no"}.`,
    `User message:\n${input.userText}`,
    "Output contract:",
    "- assistantText: the final assistant answer text.",
    "- promptSuggestions: array of concise ready-to-use prompt strings for prompt mode. Use an empty array when not applicable.",
    "- fieldMapping: object with productName, sellingPoints, materialInfo, sizeInfo, brandName.",
    "- Fill missing mapping fields with empty strings.",
  ].join("\n");
}

function normalizeFieldMapping(raw: unknown): AgentChatFieldMapping {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_FIELD_MAPPING };
  }

  return {
    productName: typeof (raw as { productName?: unknown }).productName === "string" ? (raw as { productName: string }).productName.trim() : "",
    sellingPoints: typeof (raw as { sellingPoints?: unknown }).sellingPoints === "string" ? (raw as { sellingPoints: string }).sellingPoints.trim() : "",
    materialInfo: typeof (raw as { materialInfo?: unknown }).materialInfo === "string" ? (raw as { materialInfo: string }).materialInfo.trim() : "",
    sizeInfo: typeof (raw as { sizeInfo?: unknown }).sizeInfo === "string" ? (raw as { sizeInfo: string }).sizeInfo.trim() : "",
    brandName: typeof (raw as { brandName?: unknown }).brandName === "string" ? (raw as { brandName: string }).brandName.trim() : "",
  };
}

function parseModelJson(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    if (fenced) {
      return JSON.parse(fenced) as Record<string, unknown>;
    }
    throw new AgentChatRequestError("Provider returned invalid JSON.", 502);
  }
}

function normalizePromptSuggestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizeAssistantResponse(raw: Record<string, unknown>): AgentChatResponse {
  const assistantText = typeof raw.assistantText === "string" ? raw.assistantText.trim() : "";
  return {
    assistantText: assistantText || "I could not generate a useful answer from the provided context.",
    fieldMapping: normalizeFieldMapping(raw.fieldMapping),
    promptSuggestions: normalizePromptSuggestions(raw.promptSuggestions),
  };
}

export async function runAgentChatFromFormData(formData: FormData): Promise<AgentChatResponse> {
  const settings = getSettings();
  if (!settings.defaultApiKey.trim() || !settings.defaultTextModel.trim()) {
    throw new AgentChatRequestError("API key and text model must be configured in Settings.", 400);
  }

  const agentType = normalizeAgentType(formData.get("agentType"));
  const userText = readRequiredTextField(formData, "userText");
  const history = parseConversationHistory(formData);
  const imagePart = await readOptionalImage(formData);
  const endpoint = resolveProviderEndpoint({
    apiBaseUrl: settings.defaultApiBaseUrl,
    apiVersion: settings.defaultApiVersion,
  });
  const headers = parseHeadersJson(settings.defaultApiHeaders);
  const agentSettings = resolveAgentProfileSettings(settings.agentSettingsJson, agentType);

  const client = new GoogleGenAI({
    apiKey: settings.defaultApiKey,
    httpOptions: {
      baseUrl: endpoint.baseUrl,
      apiVersion: endpoint.apiVersion,
      headers,
    },
  });

  const contents: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  if (imagePart) {
    contents.push({
      inlineData: imagePart,
    });
  }
  contents.push({
    text: `${agentSettings.systemPrompt}\n\n${buildUserPrompt({
      agentType,
      userText,
      history,
      hasImage: Boolean(imagePart),
    })}`,
  });

  const response = await client.models.generateContent({
    model: settings.defaultTextModel,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: AGENT_CHAT_RESPONSE_SCHEMA,
      temperature: agentType === "image-analyst" ? 0.15 : 0.25,
    },
  });

  return normalizeAssistantResponse(parseModelJson(response.text ?? ""));
}
