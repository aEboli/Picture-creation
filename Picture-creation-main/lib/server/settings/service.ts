import "server-only";

import { cache } from "react";

import { testFeishuConnection } from "@/lib/feishu";
import { formatFeishuFieldMapping, parseFeishuFieldMapping } from "@/lib/feishu-field-mapping";
import {
  buildMultimodalDiagnosticBranchConfig,
  buildMultimodalDiagnosticPrompt,
  buildMultimodalDiagnosticTextPrompt,
  createDeterministicMultimodalDiagnosticImage,
  resolveMultimodalDiagnosticFinalVerdict,
  testMultimodalDiagnosticProbe,
  testMultimodalDiagnosticTextProbe,
  testProviderConnection,
  type MultimodalDiagnosticImage,
  type MultimodalDiagnosticScore,
} from "@/lib/gemini";
import type { AppSettings } from "@/lib/types";

import { getSettingsSnapshot, updateSettingsSnapshot } from "./store";

export class SettingsServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "SettingsServiceError";
    this.status = status;
  }
}

const readSettingsSnapshot = cache(() => getSettingsSnapshot());

export function getSettingsForQuery(): AppSettings {
  return readSettingsSnapshot();
}

export function updateSettingsFromInput(input: Partial<AppSettings> | null | undefined): AppSettings {
  const body = input ?? {};

  try {
    validateHeadersJson(body.defaultApiHeaders);
    validateFeishuFieldMappingJson(body.feishuFieldMappingJson);
  } catch (error) {
    throw new SettingsServiceError(error instanceof Error ? error.message : "Invalid headers JSON.", 400);
  }

  const normalizedBody = {
    ...body,
    feishuFieldMappingJson:
      body.feishuFieldMappingJson === undefined ? undefined : formatFeishuFieldMapping(body.feishuFieldMappingJson),
  };

  return updateSettingsSnapshot(normalizedBody);
}

export async function testProviderConnectionFromInput(input: Partial<AppSettings> | null | undefined) {
  const body = input ?? {};

  if (!body.defaultApiKey || !body.defaultTextModel) {
    throw new SettingsServiceError("API key and text model are required.", 400);
  }

  return testProviderConnection({
    apiKey: body.defaultApiKey,
    textModel: body.defaultTextModel,
    apiBaseUrl: body.defaultApiBaseUrl,
    apiVersion: body.defaultApiVersion,
    apiHeaders: body.defaultApiHeaders,
  });
}

export async function testFeishuConnectionFromInput(input: Partial<AppSettings> | null | undefined) {
  const body = input ?? {};

  if (!body.feishuAppId || !body.feishuAppSecret || !body.feishuBitableAppToken || !body.feishuBitableTableId) {
    throw new SettingsServiceError("Feishu App ID, App Secret, Bitable App Token, and Table ID are required.", 400);
  }

  try {
    parseFeishuFieldMapping(body.feishuFieldMappingJson);
  } catch (error) {
    throw new SettingsServiceError(error instanceof Error ? error.message : "Feishu connection test failed.", 400);
  }

  return testFeishuConnection({
    defaultApiKey: "",
    defaultTextModel: "",
    defaultImageModel: "",
    defaultApiBaseUrl: "",
    defaultApiVersion: "v1beta",
    defaultApiHeaders: "",
    storageDir: "",
    maxConcurrency: 1,
    defaultUiLanguage: "zh",
    feishuSyncEnabled: Boolean(body.feishuSyncEnabled),
    feishuAppId: body.feishuAppId,
    feishuAppSecret: body.feishuAppSecret,
    feishuBitableAppToken: body.feishuBitableAppToken,
    feishuBitableTableId: body.feishuBitableTableId,
    feishuUploadParentType: body.feishuUploadParentType || "bitable_image",
    feishuFieldMappingJson: body.feishuFieldMappingJson || "{}",
    agentSettingsJson: "{}",
  });
}

export interface MultimodalSettingsInput extends Partial<AppSettings> {
  officialApiKey?: string;
  officialTextModel?: string;
  officialApiVersion?: string;
  officialApiHeaders?: string;
}

export interface MultimodalDiagnosticBranchResult {
  branchName: "relay" | "official";
  officialDirect: boolean;
  baseUrlUsed: string | null;
  model: string;
  sentImage: {
    mimeType: string;
    width: number;
    height: number;
    token: string;
    description: string;
  };
  textProbe: {
    ok: boolean;
    rawText: string | null;
    error: string | null;
    providerDebug: {
      branchName: "relay" | "official";
      baseUrlUsed: string | null;
      officialDirect: boolean;
      model: string;
      prompt: string;
      rawText: string | null;
      error: string | null;
      sentImage?: {
        mimeType: string;
        width: number;
        height: number;
        token: string;
        description: string;
      } | null;
      jsonParsed?: Record<string, unknown> | null;
      score?: MultimodalDiagnosticScore | null;
    };
  };
  multimodalProbe: {
    ok: boolean;
    rawText: string | null;
    jsonParsed: Record<string, unknown> | null;
    classification: "exact_match" | "partial_match" | "text_only_or_no_vision" | "request_failed" | "auth_or_model_mismatch";
    score: MultimodalDiagnosticScore;
    error: string | null;
    providerDebug: {
      branchName: "relay" | "official";
      baseUrlUsed: string | null;
      officialDirect: boolean;
      model: string;
      prompt: string;
      sentImage?: {
        mimeType: string;
        width: number;
        height: number;
        token: string;
        description: string;
      } | null;
      rawText: string | null;
      jsonParsed: Record<string, unknown> | null;
      score?: MultimodalDiagnosticScore | null;
      error: string | null;
    };
  };
};

export interface MultimodalDiagnosticResponse {
  ok: true;
  finalVerdict:
    | "relay_multimodal_ok"
    | "relay_text_ok_but_multimodal_failed"
    | "official_ok_relay_failed"
    | "both_multimodal_failed"
    | "official_inconclusive";
  summary: string;
  branches: {
    relay: MultimodalDiagnosticBranchResult;
    official: MultimodalDiagnosticBranchResult;
  };
}

function stripDiagnosticImage(image: MultimodalDiagnosticImage) {
  return {
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    token: image.token,
    description: image.description,
  };
}

function buildBranchProviderDebug(
  branch: MultimodalDiagnosticBranchResult["branchName"],
  config: ReturnType<typeof buildMultimodalDiagnosticBranchConfig>,
  prompt: string,
  rawText: string | null,
  error: string | null,
  sentImage?: MultimodalDiagnosticBranchResult["sentImage"],
  jsonParsed?: Record<string, unknown> | null,
  score?: MultimodalDiagnosticScore,
) {
  return {
    branchName: branch,
    baseUrlUsed: config.baseUrlUsed,
    officialDirect: config.officialDirect,
    model: config.model,
    prompt,
    sentImage: sentImage ?? null,
    rawText,
    jsonParsed: jsonParsed ?? null,
    score: score ?? null,
    error,
  };
}

function buildMultimodalDiagnosticSummary(verdict: MultimodalDiagnosticResponse["finalVerdict"], relay: MultimodalDiagnosticBranchResult, official: MultimodalDiagnosticBranchResult) {
  const summaryMap: Record<MultimodalDiagnosticResponse["finalVerdict"], string> = {
    relay_multimodal_ok: "Relay branch passed the multimodal probe.",
    relay_text_ok_but_multimodal_failed: "Relay text probe passed, but the multimodal probe did not.",
    official_ok_relay_failed: "Official direct access passed while relay did not.",
    both_multimodal_failed: "Both branches failed the multimodal probe.",
    official_inconclusive: "Official direct access was inconclusive.",
  };

  return `${summaryMap[verdict]} Relay=${relay.multimodalProbe.classification}; Official=${official.multimodalProbe.classification}.`;
}

async function runMultimodalBranch(
  branchName: "relay" | "official",
  input: MultimodalSettingsInput,
  sentImage: MultimodalDiagnosticImage,
) {
  const config = buildMultimodalDiagnosticBranchConfig(branchName, input);
  const textPrompt = buildMultimodalDiagnosticTextPrompt();
  const multimodalPrompt = buildMultimodalDiagnosticPrompt();
  const [textProbe, multimodalProbe] = await Promise.all([
    testMultimodalDiagnosticTextProbe({
      apiKey: config.apiKey,
      textModel: config.model,
      apiBaseUrl: config.baseUrlUsed ?? undefined,
      apiVersion: config.apiVersion,
      apiHeaders: config.apiHeaders,
    }),
    testMultimodalDiagnosticProbe(
      {
        apiKey: config.apiKey,
        textModel: config.model,
        apiBaseUrl: config.baseUrlUsed ?? undefined,
        apiVersion: config.apiVersion,
        apiHeaders: config.apiHeaders,
      },
      sentImage,
    ),
  ]);

  const imageSummary = stripDiagnosticImage(multimodalProbe.sentImage ?? sentImage);

  return {
    branchName,
    officialDirect: config.officialDirect,
    baseUrlUsed: config.baseUrlUsed,
    model: config.model,
    sentImage: imageSummary,
    textProbe: {
      ok: textProbe.ok,
      rawText: textProbe.rawText,
      error: textProbe.error,
      providerDebug: buildBranchProviderDebug(
        branchName,
        config,
        textPrompt,
        textProbe.rawText,
        textProbe.error,
      ),
    },
    multimodalProbe: {
      ok: multimodalProbe.ok,
      rawText: multimodalProbe.rawText,
      jsonParsed: multimodalProbe.jsonParsed,
      classification: multimodalProbe.classification,
      score: multimodalProbe.score,
      error: multimodalProbe.error,
      providerDebug: buildBranchProviderDebug(
        branchName,
        config,
        multimodalPrompt,
        multimodalProbe.rawText,
        multimodalProbe.error,
        imageSummary,
        multimodalProbe.jsonParsed,
        multimodalProbe.score,
      ),
    },
  } satisfies MultimodalDiagnosticBranchResult;
}

export async function testMultimodalConnectionFromInput(input: MultimodalSettingsInput | null | undefined): Promise<MultimodalDiagnosticResponse> {
  const body = input ?? {};

  if (!body.defaultApiKey || !body.defaultTextModel) {
    throw new SettingsServiceError("API key and text model are required.", 400);
  }

  try {
    validateHeadersJson(body.defaultApiHeaders);
    validateHeadersJson(body.officialApiHeaders);
  } catch (error) {
    throw new SettingsServiceError(error instanceof Error ? error.message : "Invalid headers JSON.", 400);
  }

  const sentImage = await createDeterministicMultimodalDiagnosticImage();
  const [relay, official] = await Promise.all([
    runMultimodalBranch("relay", body, sentImage),
    runMultimodalBranch("official", body, sentImage),
  ]);

  const finalVerdict = resolveMultimodalDiagnosticFinalVerdict({
    relay: {
      textProbe: { ok: relay.textProbe.ok },
      multimodalProbe: { classification: relay.multimodalProbe.classification },
    },
    official: {
      textProbe: { ok: official.textProbe.ok },
      multimodalProbe: { classification: official.multimodalProbe.classification },
    },
  });

  return {
    ok: true,
    finalVerdict,
    summary: buildMultimodalDiagnosticSummary(finalVerdict, relay, official),
    branches: {
      relay,
      official,
    },
  };
}

function validateHeadersJson(rawHeaders?: string) {
  if (!rawHeaders?.trim()) {
    return;
  }

  const parsed = JSON.parse(rawHeaders);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Custom headers JSON must be an object.");
  }
}

function validateFeishuFieldMappingJson(rawMapping?: string) {
  parseFeishuFieldMapping(rawMapping);
}
