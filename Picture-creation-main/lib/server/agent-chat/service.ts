import "server-only";

import { GoogleGenAI } from "@google/genai";

import { resolveAgentProfileSettings } from "@/lib/agent-settings";
import { getSettings } from "@/lib/db";
import { resolveProviderType } from "@/lib/provider-router";
import { resolveProviderEndpoint } from "@/lib/provider-url";
import type { ProviderOverride } from "@/lib/types";

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

function readProviderString(input: Record<string, unknown>, key: keyof ProviderOverride) {
  const value = input[key];
  return typeof value === "string" ? value.trim() : undefined;
}

function parseTemporaryProvider(formData: FormData): ProviderOverride | undefined {
  const rawProvider = formData.get("temporaryProvider");
  if (typeof rawProvider !== "string" || !rawProvider.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawProvider);
  } catch {
    throw new AgentChatRequestError("temporaryProvider must be valid JSON.", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AgentChatRequestError("temporaryProvider must be a JSON object.", 400);
  }

  const source = parsed as Record<string, unknown>;
  const provider = readProviderString(source, "provider");
  const apiKey = readProviderString(source, "apiKey");
  const apiBaseUrl = readProviderString(source, "apiBaseUrl");
  const apiVersion = readProviderString(source, "apiVersion");
  const apiHeaders = typeof source.apiHeaders === "string" ? source.apiHeaders : undefined;
  const textModel = readProviderString(source, "textModel");
  const imageModel = readProviderString(source, "imageModel");

  if (!provider && !apiKey && !apiBaseUrl && !apiVersion && !apiHeaders && !textModel && !imageModel) {
    return undefined;
  }

  return {
    provider,
    apiKey,
    apiBaseUrl,
    apiVersion,
    apiHeaders,
    textModel,
    imageModel,
  };
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

function extractOpenAITextFromResponse(response: any): string {
  if (Array.isArray(response?.output)) {
    for (const item of response.output) {
      if (Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (part?.type === "output_text" && typeof part.text === "string") {
            return part.text;
          }
        }
      }
    }
  }

  const chatContent = response?.choices?.[0]?.message?.content;
  return typeof chatContent === "string" ? chatContent : "";
}

async function createOpenAIAgentHttpError(response: Response): Promise<AgentChatRequestError> {
  const raw = await response.text().catch(() => "");
  let message = raw.trim();

  if (message) {
    try {
      const parsed = JSON.parse(message) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message || parsed.message || message;
    } catch {
      // Keep the raw provider response when it is not JSON.
    }
  }

  return new AgentChatRequestError(message || `OpenAI Responses request failed with HTTP ${response.status}.`, response.status === 401 ? 401 : 502);
}

async function runOpenAIAgentChat(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiHeaders?: string;
  agentType: AgentType;
  imagePart: Awaited<ReturnType<typeof readOptionalImage>>;
  promptText: string;
}): Promise<AgentChatResponse> {
  const { resolveOpenAIResponsesUrl } = await import("@/lib/openai-provider");
  const content: Array<{ type: "input_image"; image_url: string } | { type: "input_text"; text: string }> = [];
  if (input.imagePart) {
    content.push({
      type: "input_image",
      image_url: `data:${input.imagePart.mimeType};base64,${input.imagePart.data}`,
    });
  }
  content.push({
    type: "input_text",
    text: input.promptText,
  });

  const response = await fetch(resolveOpenAIResponsesUrl(input.apiBaseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...(parseHeadersJson(input.apiHeaders) ?? {}),
    },
    body: JSON.stringify({
      model: input.textModel,
      input: [
        {
          role: "user",
          content,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "agent_chat_response",
          schema: AGENT_CHAT_RESPONSE_SCHEMA,
        },
      },
      temperature: input.agentType === "image-analyst" ? 0.15 : 0.25,
    }),
  });

  if (!response.ok) {
    throw await createOpenAIAgentHttpError(response);
  }

  return normalizeAssistantResponse(parseModelJson(extractOpenAITextFromResponse(await response.json())));
}

export async function runAgentChatFromFormData(formData: FormData): Promise<AgentChatResponse> {
  const settings = getSettings();
  const temporaryProvider = parseTemporaryProvider(formData);
  const apiKey = temporaryProvider?.apiKey?.trim() || settings.defaultApiKey.trim();
  const textModel = temporaryProvider?.textModel?.trim() || settings.defaultTextModel.trim();
  const apiBaseUrl = temporaryProvider?.apiBaseUrl ?? settings.defaultApiBaseUrl;
  const apiVersion = temporaryProvider?.apiVersion ?? settings.defaultApiVersion;
  const apiHeaders = temporaryProvider?.apiHeaders ?? settings.defaultApiHeaders;
  const providerType = resolveProviderType(temporaryProvider?.provider ?? settings.defaultProvider);

  if (!apiKey || !textModel) {
    throw new AgentChatRequestError("API key and text model must be configured in Settings.", 400);
  }

  const agentType = normalizeAgentType(formData.get("agentType"));
  const userText = readRequiredTextField(formData, "userText");
  const history = parseConversationHistory(formData);
  const imagePart = await readOptionalImage(formData);
  const endpoint = resolveProviderEndpoint({
    apiBaseUrl,
    apiVersion,
  });
  const headers = parseHeadersJson(apiHeaders);
  const agentSettings = resolveAgentProfileSettings(settings.agentSettingsJson, agentType);
  const promptText = `${agentSettings.systemPrompt}\n\n${buildUserPrompt({
    agentType,
    userText,
    history,
    hasImage: Boolean(imagePart),
  })}`;

  if (providerType === "openai") {
    return runOpenAIAgentChat({
      apiKey,
      textModel,
      apiBaseUrl,
      apiHeaders,
      agentType,
      imagePart,
      promptText,
    });
  }

  const client = new GoogleGenAI({
    apiKey,
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
    text: promptText,
  });

  const response = await client.models.generateContent({
    model: textModel,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: AGENT_CHAT_RESPONSE_SCHEMA,
      temperature: agentType === "image-analyst" ? 0.15 : 0.25,
    },
  });

  return normalizeAssistantResponse(parseModelJson(response.text ?? ""));
}
