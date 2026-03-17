import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { APP_NAME } from "@/lib/constants";
import { getRecommendedFeishuFieldMappingJson } from "@/lib/feishu-field-mapping";
import type { AppSettings } from "@/lib/types";

export { APP_NAME };

const configuredDataDir = process.env.PICTURE_CREATION_DATA_DIR ?? process.env.COMMERCE_STUDIO_DATA_DIR;
const configuredStorageDir = process.env.PICTURE_CREATION_STORAGE_DIR ?? process.env.COMMERCE_STUDIO_STORAGE_DIR;
const configuredDatabasePath = process.env.PICTURE_CREATION_DB_PATH ?? process.env.COMMERCE_STUDIO_DB_PATH;
const localDataDir = path.resolve(path.join(process.cwd(), "data"));
const localAppDataRoot = path.resolve(process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"));
const dedicatedAppDataRoot = path.join(localAppDataRoot, "Picture-creation");
const dedicatedDataDir = path.join(dedicatedAppDataRoot, "data");
const legacyDedicatedAppDataRoot = path.join(localAppDataRoot, "Commerce-Image-Studio");
const legacyDedicatedDataDir = path.join(legacyDedicatedAppDataRoot, "data");
const DATABASE_FILE_CANDIDATES = ["picture-creation.sqlite", "commerce-image-studio.sqlite"] as const;

function hasExistingData(dirPath: string): boolean {
  return DATABASE_FILE_CANDIDATES.some((fileName) => fs.existsSync(path.join(dirPath, fileName))) || fs.existsSync(path.join(dirPath, "assets"));
}

function getDefaultDataDir(): string {
  if (configuredDataDir) {
    return configuredDataDir;
  }
  if (hasExistingData(localDataDir)) {
    return localDataDir;
  }
  if (hasExistingData(dedicatedDataDir)) {
    return dedicatedDataDir;
  }
  if (hasExistingData(legacyDedicatedDataDir)) {
    return legacyDedicatedDataDir;
  }
  return dedicatedDataDir;
}

function getDefaultDatabaseFileName(dataDir: string): string {
  return DATABASE_FILE_CANDIDATES.find((fileName) => fs.existsSync(path.join(dataDir, fileName))) ?? "picture-creation.sqlite";
}

export const DEFAULT_DATA_DIR = path.resolve(
  getDefaultDataDir(),
);
export const DEFAULT_STORAGE_DIR = path.resolve(configuredStorageDir ?? path.join(DEFAULT_DATA_DIR, "assets"));
export const DEFAULT_DATABASE_PATH = path.resolve(
  configuredDatabasePath ?? path.join(DEFAULT_DATA_DIR, getDefaultDatabaseFileName(DEFAULT_DATA_DIR)),
);
export const DEFAULT_FEISHU_FIELD_MAPPING = getRecommendedFeishuFieldMappingJson();

export const DEFAULT_SETTINGS: AppSettings = {
  defaultApiKey: "",
  defaultTextModel: "gemini-3.1-flash-lite-preview",
  defaultImageModel: "gemini-3.1-flash-image-preview",
  defaultApiBaseUrl: "",
  defaultApiVersion: "v1beta",
  defaultApiHeaders: "",
  storageDir: DEFAULT_STORAGE_DIR,
  maxConcurrency: 2,
  defaultUiLanguage: "zh",
  feishuSyncEnabled: false,
  feishuAppId: "",
  feishuAppSecret: "",
  feishuBitableAppToken: "",
  feishuBitableTableId: "",
  feishuUploadParentType: "bitable_image",
  feishuFieldMappingJson: DEFAULT_FEISHU_FIELD_MAPPING,
};
