import "server-only";

import { cache } from "react";

import { testFeishuConnection } from "@/lib/feishu";
import { formatFeishuFieldMapping, parseFeishuFieldMapping } from "@/lib/feishu-field-mapping";
import { testProviderConnection } from "@/lib/gemini";
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
  });
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
