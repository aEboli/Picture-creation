import type { AppSettings, AssetRecord, FeishuFieldMapping, JobItemRecord, JobRecord } from "@/lib/types";
import type { JobDetails } from "@/lib/types";

const FEISHU_OPEN_BASE_URL = "https://open.feishu.cn";
const FEISHU_MEDIA_UPLOAD_ALL_LIMIT = 20 * 1024 * 1024;
const DEFAULT_FEISHU_MEDIA_BLOCK_SIZE = 4 * 1024 * 1024;
const FEISHU_REQUEST_RETRY_ATTEMPTS = 3;
const FEISHU_UPLOAD_SESSION_ATTEMPTS = 2;
const FEISHU_RETRY_BASE_DELAY_MS = 600;
export const FEISHU_FIELD_MAPPING_KEYS: Array<keyof FeishuFieldMapping> = [
  "title",
  "sourceImage",
  "image",
  "mode",
  "platform",
  "country",
  "language",
  "typeSummary",
  "ratioSummary",
  "resolutionSummary",
  "sizeSummary",
  "statusSummary",
  "ratio",
  "resolution",
  "requestedSize",
  "actualSize",
  "status",
  "promptTranslation",
  "promptOptimization",
  "prompt",
  "negativePrompt",
  "createdAt",
  "jobId",
  "itemId",
];
export const RECOMMENDED_FEISHU_FIELD_MAPPING: FeishuFieldMapping = {
  sourceImage: "原图",
  image: "生成图",
  prompt: "提示词",
  statusSummary: "生成统计",
};

type FeishuChunkSeqMode = "index" | "offset";

type FeishuApiEnvelope<T> = {
  code?: number;
  msg?: string;
  message?: string;
  data?: T;
};

type FeishuTokenResponse = {
  code?: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

type FeishuMediaUploadResponse = {
  file_token?: string;
};

type FeishuMediaUploadPrepareResponse = {
  upload_id?: string;
  block_size?: number;
  block_num?: number;
};

type FeishuRecordResponse = {
  record?: {
    record_id?: string;
  };
};

type FeishuRecordWithFields = {
  record_id?: string;
  fields?: Record<string, unknown>;
};

type FeishuRecordDetailResponse = {
  record?: FeishuRecordWithFields;
};

type FeishuRecordListResponse = {
  items?: FeishuRecordWithFields[];
  page_token?: string;
  has_more?: boolean;
};

type FeishuFieldListResponse = {
  items?: Array<{
    field_name?: string;
    ui_type?: string;
    type?: number;
  }>;
};

function ensureFeishuConfigured(settings: AppSettings) {
  if (!settings.feishuAppId || !settings.feishuAppSecret) {
    throw new Error("Feishu App ID and App Secret are required.");
  }

  if (!settings.feishuBitableAppToken || !settings.feishuBitableTableId) {
    throw new Error("Feishu Bitable app token and table ID are required.");
  }
}

function sanitizeFeishuFileName(originalName: string) {
  const fallback = "generated-image.png";
  const trimmed = originalName.trim();
  if (!trimmed) {
    return fallback;
  }

  const extensionMatch = trimmed.match(/(\.[A-Za-z0-9]+)$/);
  const extension = extensionMatch?.[1] ?? "";
  const baseName = extension ? trimmed.slice(0, -extension.length) : trimmed;
  const safeBaseName = baseName
    .replace(/[\\/:*?"<>|\r\n]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedBaseName = safeBaseName || "generated-image";
  const maxBaseLength = Math.max(1, 120 - extension.length);

  return `${normalizedBaseName.slice(0, maxBaseLength)}${extension}`;
}

function computeAdler32(buffer: Buffer) {
  const MOD_ADLER = 65521;
  let a = 1;
  let b = 0;

  for (const value of buffer) {
    a = (a + value) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }

  return (((b << 16) | a) >>> 0).toString();
}

function isFeishuParamsError(error: unknown) {
  return error instanceof Error && /params error/i.test(error.message);
}

function isFeishuRecordNotFoundError(error: unknown) {
  return error instanceof Error && /RecordIdNotFound/i.test(error.message);
}

function isRetryableFeishuRequestError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /(fetch failed|network|socket|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|HTTP 5\d{2}|HTTP 429|rate limit)/i.test(
    error.message,
  );
}

async function waitForFeishuRetry(attempt: number) {
  const delayMs = FEISHU_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function withFeishuRetry<T>(
  task: () => Promise<T>,
  options: {
    label: string;
    attempts?: number;
    retryWhen?: (error: unknown) => boolean;
  },
) {
  const attempts = options.attempts ?? FEISHU_REQUEST_RETRY_ATTEMPTS;
  const retryWhen = options.retryWhen ?? isRetryableFeishuRequestError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!retryWhen(error) || attempt === attempts) {
        break;
      }

      await waitForFeishuRetry(attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown Feishu request error.";
  throw new Error(`${options.label} failed after ${attempts} attempts: ${message}`);
}

function formatFeishuErrorMessage(payload: (FeishuApiEnvelope<unknown> & Record<string, unknown>) | null, response: Response) {
  const code = payload?.code;
  const baseMessage = payload?.msg || payload?.message || `Feishu request failed with HTTP ${response.status}.`;

  if (code === 1061004) {
    return `${baseMessage} According to Feishu docs, the current calling identity does not have edit permission on the target cloud document. Please add the app (or a group containing the app) as a collaborator to the target Bitable with edit/manage permission, then publish the app permissions again if needed.`;
  }

  if (code === 1061073) {
    return `${baseMessage} The app does not have the required Feishu API scope. Please check the app scopes for Bitable and Drive/Media upload, then publish the latest app version.`;
  }

  return baseMessage;
}

async function requestFeishuJson<T>(
  path: string,
  init: RequestInit,
  options?: { unwrap?: "data" | "root" },
): Promise<T> {
  const response = await fetch(`${FEISHU_OPEN_BASE_URL}${path}`, init);
  const payload = (await response.json().catch(() => null)) as (FeishuApiEnvelope<T> & Record<string, unknown>) | null;

  if (!response.ok) {
    throw new Error(formatFeishuErrorMessage(payload, response));
  }

  if ((payload?.code ?? 0) !== 0) {
    throw new Error(formatFeishuErrorMessage(payload, response));
  }

  if (options?.unwrap === "root") {
    return (payload ?? {}) as T;
  }

  return (payload?.data ?? {}) as T;
}

export function parseFeishuFieldMapping(rawJson?: string): FeishuFieldMapping {
  if (!rawJson?.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Feishu field mapping JSON must be an object.");
  }

  const mapping: FeishuFieldMapping = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === "string" && value.trim()) {
      const normalizedKey = key === "file" ? "image" : key;
      if (FEISHU_FIELD_MAPPING_KEYS.includes(normalizedKey as keyof FeishuFieldMapping)) {
        mapping[normalizedKey as keyof FeishuFieldMapping] = value.trim();
      }
    }
  }

  return mapping;
}

export function stringifyFeishuFieldMapping(mapping: FeishuFieldMapping) {
  const ordered = FEISHU_FIELD_MAPPING_KEYS.reduce<FeishuFieldMapping>((acc, key) => {
    const value = mapping[key];
    if (typeof value === "string" && value.trim()) {
      acc[key] = value.trim();
    }
    return acc;
  }, {});

  return JSON.stringify(ordered, null, 2);
}

export function getRecommendedFeishuFieldMappingJson() {
  return stringifyFeishuFieldMapping(RECOMMENDED_FEISHU_FIELD_MAPPING);
}

export function formatFeishuFieldMapping(rawJson?: string) {
  const parsed = parseFeishuFieldMapping(rawJson);
  if (!Object.keys(parsed).length) {
    return "{}";
  }

  return stringifyFeishuFieldMapping(parsed);
}

export async function getFeishuTenantAccessToken(settings: AppSettings) {
  ensureFeishuConfigured(settings);

  const data = await requestFeishuJson<FeishuTokenResponse>("/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: settings.feishuAppId,
      app_secret: settings.feishuAppSecret,
    }),
  }, { unwrap: "root" });

  if (!data.tenant_access_token) {
    throw new Error("Feishu did not return a tenant access token.");
  }

  return data.tenant_access_token;
}

export async function testFeishuConnection(settings: AppSettings) {
  const accessToken = await getFeishuTenantAccessToken(settings);
  await requestFeishuJson<{ items?: unknown[] }>(
    `/open-apis/bitable/v1/apps/${settings.feishuBitableAppToken}/tables/${settings.feishuBitableTableId}/records?page_size=1`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const fields = await requestFeishuJson<FeishuFieldListResponse>(
    `/open-apis/bitable/v1/apps/${settings.feishuBitableAppToken}/tables/${settings.feishuBitableTableId}/fields?page_size=100`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const mapping = parseFeishuFieldMapping(settings.feishuFieldMappingJson);
  const configuredFieldNames = Array.from(
    new Set(Object.values(mapping).filter((value): value is string => Boolean(value?.trim()))),
  );
  const availableFieldNames = new Set((fields.items ?? []).map((item) => item.field_name).filter(Boolean));
  const missingFieldNames = configuredFieldNames.filter((fieldName) => !availableFieldNames.has(fieldName));

  if (missingFieldNames.length > 0) {
    const existing = Array.from(availableFieldNames).join("、") || "（空）";
    throw new Error(
      `Feishu table fields do not match the field mapping. Missing: ${missingFieldNames.join("、")}. Existing fields: ${existing}.`,
    );
  }

  try {
    const probeBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP6sAAAAASUVORK5CYII=",
      "base64",
    );
    await uploadAssetToFeishuBitable({
      accessToken,
      settings,
      asset: {
        id: "probe",
        jobId: "probe",
        jobItemId: null,
        kind: "generated",
        originalName: "codex-feishu-probe.png",
        mimeType: "image/png",
        filePath: "",
        width: 1,
        height: 1,
        sizeBytes: probeBuffer.byteLength,
        sha256: "",
        createdAt: new Date().toISOString(),
      },
      buffer: probeBuffer,
    });
  } catch (error) {
    throw new Error(
      `Feishu image upload failed. Please check app scopes and the parent_type setting. ${
        error instanceof Error ? error.message : "Unknown upload error."
      }`,
    );
  }

  return "Feishu Bitable connection and image upload succeeded.";
}

async function uploadAssetToFeishuBitable(input: {
  accessToken: string;
  settings: AppSettings;
  asset: AssetRecord;
  buffer: Buffer;
}) {
  const fileName = sanitizeFeishuFileName(input.asset.originalName);
  const parentType = input.settings.feishuUploadParentType || "bitable_image";
  const parentNode = input.settings.feishuBitableAppToken;

  const toArrayBuffer = (buffer: Buffer) =>
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

  const uploadAssetInChunks = async (seqMode: FeishuChunkSeqMode) => {
    let lastError: unknown;

    for (let sessionAttempt = 1; sessionAttempt <= FEISHU_UPLOAD_SESSION_ATTEMPTS; sessionAttempt += 1) {
      try {
        const prepared = await withFeishuRetry(
          () =>
            requestFeishuJson<FeishuMediaUploadPrepareResponse>(
              "/open-apis/drive/v1/medias/upload_prepare",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${input.accessToken}`,
                  "Content-Type": "application/json; charset=utf-8",
                },
                body: JSON.stringify({
                  file_name: fileName,
                  parent_type: parentType,
                  parent_node: parentNode,
                  size: input.buffer.byteLength,
                }),
              },
            ),
          { label: "Feishu media upload prepare" },
        );

        if (!prepared.upload_id) {
          throw new Error("Feishu media upload prepare did not return an upload ID.");
        }
        const uploadId = prepared.upload_id;

        const blockSize = prepared.block_size || DEFAULT_FEISHU_MEDIA_BLOCK_SIZE;
        const chunks: Array<{ start: number; buffer: Buffer }> = [];
        for (let start = 0; start < input.buffer.byteLength; start += blockSize) {
          chunks.push({
            start,
            buffer: input.buffer.subarray(start, Math.min(start + blockSize, input.buffer.byteLength)),
          });
        }

        for (const [index, chunk] of chunks.entries()) {
          await withFeishuRetry(
            async () => {
              const partForm = new FormData();
              partForm.set("upload_id", uploadId);
              partForm.set("seq", seqMode === "offset" ? String(chunk.start) : String(index));
              partForm.set("size", String(chunk.buffer.byteLength));
              partForm.set("checksum", computeAdler32(chunk.buffer));
              partForm.set("file", new Blob([toArrayBuffer(chunk.buffer)], { type: input.asset.mimeType }), fileName);

              await requestFeishuJson<null>(
                "/open-apis/drive/v1/medias/upload_part",
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${input.accessToken}`,
                  },
                  body: partForm,
                },
              );
            },
            { label: `Feishu media upload part ${index + 1}/${chunks.length}` },
          );
        }

        return await withFeishuRetry(
          () =>
            requestFeishuJson<FeishuMediaUploadResponse>(
              "/open-apis/drive/v1/medias/upload_finish",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${input.accessToken}`,
                  "Content-Type": "application/json; charset=utf-8",
                },
                body: JSON.stringify({
                  upload_id: uploadId,
                  block_num: prepared.block_num || chunks.length,
                }),
              },
            ),
          { label: "Feishu media upload finish" },
        );
      } catch (error) {
        lastError = error;
        if (!isRetryableFeishuRequestError(error) || sessionAttempt === FEISHU_UPLOAD_SESSION_ATTEMPTS) {
          throw error;
        }

        await waitForFeishuRetry(sessionAttempt);
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Feishu chunk upload failed without a response.");
  };

  let data: FeishuMediaUploadResponse | null = null;
  if (input.buffer.byteLength <= FEISHU_MEDIA_UPLOAD_ALL_LIMIT) {
    data = await withFeishuRetry(async () => {
      const form = new FormData();
      form.set("file_name", fileName);
      form.set("parent_type", parentType);
      form.set("parent_node", parentNode);
      form.set("size", String(input.buffer.byteLength));
      form.set("file", new Blob([toArrayBuffer(input.buffer)], { type: input.asset.mimeType }), fileName);

      return requestFeishuJson<FeishuMediaUploadResponse>(
        "/open-apis/drive/v1/medias/upload_all",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
          },
          body: form,
        },
      );
    }, { label: "Feishu media upload all" });
  } else {
    const chunkUploadErrors: string[] = [];
    for (const seqMode of ["index", "offset"] as const) {
      try {
        data = await uploadAssetInChunks(seqMode);
        chunkUploadErrors.length = 0;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown upload error.";
        chunkUploadErrors.push(`${seqMode}: ${message}`);
        if (!isFeishuParamsError(error) || seqMode === "offset") {
          throw new Error(`Feishu chunk upload failed. ${chunkUploadErrors.join(" | ")}`);
        }
      }
    }

    if (!data) {
      throw new Error("Feishu chunk upload failed without a response.");
    }
  }

  if (!data.file_token) {
    throw new Error("Feishu media upload did not return a file token.");
  }

  return data.file_token;
}

function buildModeLabel(mode: JobRecord["creationMode"]) {
  switch (mode) {
    case "amazon-a-plus":
      return "亚马逊A+模式";
    case "suite":
      return "套图模式";
    case "prompt":
      return "提示词模式";
    case "reference-remix":
      return "参考图复刻模式";
    default:
      return "标准模式";
  }
}

function buildImageTypeLabel(imageType: JobItemRecord["imageType"], language: JobRecord["uiLanguage"]) {
  const zhLabels: Record<JobItemRecord["imageType"], string> = {
    "main-image": "主图",
    lifestyle: "生活方式",
    scene: "场景图",
    "white-background": "白底图",
    model: "模特图",
    poster: "海报图",
    detail: "细节图",
    "pain-point": "痛点图",
    "feature-overview": "卖点总览",
    "material-craft": "材质工艺",
    "size-spec": "尺寸参数",
    "multi-scene": "多场景应用",
    "culture-value": "文化价值",
  };
  const enLabels: Record<JobItemRecord["imageType"], string> = {
    "main-image": "Main image",
    lifestyle: "Lifestyle",
    scene: "Scene",
    "white-background": "White background",
    model: "Model",
    poster: "Poster",
    detail: "Detail",
    "pain-point": "Pain-point",
    "feature-overview": "Feature overview",
    "material-craft": "Material & craft",
    "size-spec": "Size spec",
    "multi-scene": "Multi-scene usage",
    "culture-value": "Cultural value",
  };

  return language === "zh" ? zhLabels[imageType] : enLabels[imageType];
}

function buildJobStatusLabel(status: JobRecord["status"]) {
  switch (status) {
    case "processing":
      return "生成中";
    case "completed":
      return "已完成";
    case "partial":
      return "部分完成";
    case "failed":
      return "失败";
    default:
      return "排队中";
  }
}

function buildPromptTranslationLabel(job: JobRecord) {
  if (job.uiLanguage === "en") {
    return job.translatePromptToOutputLanguage === false ? "Keep original wording" : "Translate to output language";
  }

  return job.translatePromptToOutputLanguage === false ? "保留原文" : "翻译为输出语言";
}

function buildPromptOptimizationLabel(job: JobRecord) {
  if (job.uiLanguage === "en") {
    return job.autoOptimizePrompt ? "Enabled" : "Disabled";
  }

  return job.autoOptimizePrompt ? "已开启" : "未开启";
}

function buildTaskTitle(job: JobRecord) {
  const promptTitle = job.customPrompt?.trim().slice(0, 60);
  const baseTitle = job.productName?.trim() || promptTitle || "AI 生成图片";
  return baseTitle;
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function summarizeJoined(values: Array<string | null | undefined>, separator = ", ") {
  return uniqueNonEmpty(values).join(separator) || null;
}

function summarizePromptValues(values: Array<string | null | undefined>, maxUnique = 3) {
  const normalized = uniqueNonEmpty(values);
  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length <= maxUnique) {
    return normalized.join("\n\n---\n\n");
  }

  return `${normalized.slice(0, maxUnique).join("\n\n---\n\n")}\n\n...`;
}

function summarizeTypeCounts(items: JobDetails["items"], language: JobRecord["uiLanguage"]) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const label = buildImageTypeLabel(item.imageType, language);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const summary = Array.from(counts.entries())
    .map(([imageType, count]) => (count > 1 ? `${imageType} ×${count}` : imageType))
    .join(", ");

  return summary || null;
}

function summarizeStatus(items: JobDetails["items"]) {
  const total = items.length;
  const success = items.filter((item) => item.status === "completed").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const requestFailures = items.filter((item) => item.providerDebug?.failureStage === "provider-request").length;
  const downloadFailures = items.filter((item) => item.providerDebug?.failureStage === "provider-image-download").length;
  const responseFailures = items.filter((item) => item.providerDebug?.failureStage === "response").length;
  const breakdown = [
    requestFailures > 0 ? `请求失败 ${requestFailures}` : null,
    downloadFailures > 0 ? `下载失败 ${downloadFailures}` : null,
    responseFailures > 0 ? `模型拒绝/响应异常 ${responseFailures}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return breakdown ? `成功 ${success} / 失败 ${failed} / 总计 ${total} · ${breakdown}` : `成功 ${success} / 失败 ${failed} / 总计 ${total}`;
}

function summarizeRequestedSizes(items: JobDetails["items"]) {
  return summarizeJoined(items.map((item) => `${item.width}×${item.height}`));
}

function summarizeActualSizes(items: JobDetails["items"]) {
  return summarizeJoined(
    items.map((item) =>
      item.generatedAsset?.width && item.generatedAsset?.height
        ? `${item.generatedAsset.width}×${item.generatedAsset.height}`
        : null,
    ),
  );
}

function extractFileTokens(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const tokens = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const maybeToken = "file_token" in entry ? (entry as { file_token?: unknown }).file_token : null;
      return typeof maybeToken === "string" && maybeToken.trim() ? maybeToken.trim() : null;
    })
    .filter((token): token is string => Boolean(token));

  return Array.from(new Set(tokens));
}

function putField(
  fields: Record<string, unknown>,
  mapping: FeishuFieldMapping,
  key: keyof FeishuFieldMapping,
  value: unknown,
) {
  const fieldName = mapping[key];
  if (!fieldName) {
    return;
  }

  if (value === undefined || value === null || value === "") {
    return;
  }

  fields[fieldName] = value;
}

function buildTaskFields(input: {
  mapping: FeishuFieldMapping;
  job: JobRecord;
  details: JobDetails;
  generatedFileTokens: string[];
  sourceFileTokens: string[];
}) {
  const statusSummary = summarizeStatus(input.details.items);
  const promptSummary = summarizePromptValues(input.details.items.map((item) => item.promptText));

  const fields: Record<string, unknown> = {};
  putField(
    fields,
    input.mapping,
    "sourceImage",
    input.sourceFileTokens.length > 0 ? input.sourceFileTokens.map((fileToken) => ({ file_token: fileToken })) : null,
  );
  putField(
    fields,
    input.mapping,
    "image",
    input.generatedFileTokens.length > 0 ? input.generatedFileTokens.map((fileToken) => ({ file_token: fileToken })) : null,
  );
  putField(fields, input.mapping, "prompt", promptSummary);
  putField(fields, input.mapping, "statusSummary", statusSummary);
  return fields;
}

async function createFeishuRecord(input: {
  accessToken: string;
  settings: AppSettings;
  fields: Record<string, unknown>;
}) {
  return withFeishuRetry(
    () =>
      requestFeishuJson<FeishuRecordResponse>(
        `/open-apis/bitable/v1/apps/${input.settings.feishuBitableAppToken}/tables/${input.settings.feishuBitableTableId}/records`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ fields: input.fields }),
        },
      ),
    { label: "Feishu create record" },
  );
}

async function updateFeishuRecord(input: {
  accessToken: string;
  settings: AppSettings;
  recordId: string;
  fields: Record<string, unknown>;
}) {
  return withFeishuRetry(
    () =>
      requestFeishuJson<FeishuRecordResponse>(
        `/open-apis/bitable/v1/apps/${input.settings.feishuBitableAppToken}/tables/${input.settings.feishuBitableTableId}/records/${input.recordId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({ fields: input.fields }),
        },
      ),
    { label: "Feishu update record" },
  );
}

async function getFeishuRecordById(input: {
  accessToken: string;
  settings: AppSettings;
  recordId: string;
}) {
  return withFeishuRetry(
    () =>
      requestFeishuJson<FeishuRecordDetailResponse>(
        `/open-apis/bitable/v1/apps/${input.settings.feishuBitableAppToken}/tables/${input.settings.feishuBitableTableId}/records/${input.recordId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
          },
        },
      ),
    { label: "Feishu get record" },
  );
}

async function findFeishuRecordByJobId(input: {
  accessToken: string;
  settings: AppSettings;
  mapping: FeishuFieldMapping;
  jobId: string;
}) {
  const jobIdField = input.mapping.jobId;
  if (!jobIdField) {
    return null;
  }

  let pageToken: string | null = null;
  do {
    const query = new URLSearchParams({ page_size: "500" });
    if (pageToken) {
      query.set("page_token", pageToken);
    }

    const data = await withFeishuRetry(
      () =>
        requestFeishuJson<FeishuRecordListResponse>(
          `/open-apis/bitable/v1/apps/${input.settings.feishuBitableAppToken}/tables/${input.settings.feishuBitableTableId}/records?${query.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${input.accessToken}`,
            },
          },
        ),
      { label: "Feishu list records" },
    );

    const matched = (data.items ?? []).find((item) => {
      const value = item.fields?.[jobIdField];
      if (typeof value === "string") {
        return value.trim() === input.jobId;
      }
      if (Array.isArray(value)) {
        return value.some((entry) => entry === input.jobId);
      }
      return false;
    });

    if (matched?.record_id) {
      return matched;
    }

    pageToken = data.has_more ? data.page_token ?? null : null;
  } while (pageToken);

  return null;
}

async function resolveFeishuRecordState(input: {
  accessToken: string;
  settings: AppSettings;
  mapping: FeishuFieldMapping;
  job: JobRecord;
}) {
  const imageField = input.mapping.image;
  const sourceImageField = input.mapping.sourceImage;
  let recordId = input.job.feishuRecordId ?? null;
  let generatedFileTokens = Array.from(new Set(input.job.feishuFileTokens));
  let sourceFileTokens: string[] = [];

  if (!recordId && input.mapping.jobId) {
    const matchedRecord = await findFeishuRecordByJobId({
      accessToken: input.accessToken,
      settings: input.settings,
      mapping: input.mapping,
      jobId: input.job.id,
    });
    if (matchedRecord?.record_id) {
      recordId = matchedRecord.record_id;
      generatedFileTokens = imageField ? extractFileTokens(matchedRecord.fields?.[imageField]) : [];
      sourceFileTokens = sourceImageField ? extractFileTokens(matchedRecord.fields?.[sourceImageField]) : [];
    }
  }

  if (
    recordId &&
    ((imageField && generatedFileTokens.length === 0) || (sourceImageField && sourceFileTokens.length === 0))
  ) {
    try {
      const existingRecord = await getFeishuRecordById({
        accessToken: input.accessToken,
        settings: input.settings,
        recordId,
      });
      generatedFileTokens = imageField ? extractFileTokens(existingRecord.record?.fields?.[imageField]) : [];
      sourceFileTokens = sourceImageField ? extractFileTokens(existingRecord.record?.fields?.[sourceImageField]) : [];
    } catch (error) {
      if (!isFeishuRecordNotFoundError(error)) {
        throw error;
      }

      recordId = null;
      generatedFileTokens = [];
      sourceFileTokens = [];
    }
  }

  return {
    recordId,
    fileTokens: generatedFileTokens,
    generatedFileTokens,
    sourceFileTokens,
  };
}

async function upsertFeishuTaskRecord(input: {
  accessToken: string;
  settings: AppSettings;
  mapping: FeishuFieldMapping;
  details: JobDetails;
  recordId: string | null;
  generatedFileTokens: string[];
  sourceFileTokens: string[];
}) {
  if (!input.recordId && input.generatedFileTokens.length === 0 && input.sourceFileTokens.length === 0) {
    return {
      recordId: null,
      fileTokens: [],
      generatedFileTokens: [],
      sourceFileTokens: [],
    };
  }

  const fields = buildTaskFields({
    mapping: input.mapping,
    job: input.details.job,
    details: input.details,
    generatedFileTokens: input.generatedFileTokens,
    sourceFileTokens: input.sourceFileTokens,
  });

  let recordId = input.recordId;
  if (recordId) {
    try {
      await updateFeishuRecord({
        accessToken: input.accessToken,
        settings: input.settings,
        recordId,
        fields,
      });
    } catch (error) {
      if (!isFeishuRecordNotFoundError(error)) {
        throw error;
      }

      recordId = null;
    }
  }

  if (!recordId) {
    const data = await createFeishuRecord({
      accessToken: input.accessToken,
      settings: input.settings,
      fields,
    });
    recordId = data.record?.record_id ?? null;
  } else {
    // noop; record was updated in place above
  }

  return {
    recordId,
    fileTokens: input.generatedFileTokens,
    generatedFileTokens: input.generatedFileTokens,
    sourceFileTokens: input.sourceFileTokens,
  };
}

async function uploadAssetsToFeishu(input: {
  accessToken: string;
  settings: AppSettings;
  assets: AssetRecord[];
  label: string;
}) {
  if (input.assets.length === 0) {
    return [];
  }

  const { readAssetBuffer } = await import("@/lib/storage");
  const fileTokens: string[] = [];

  for (const asset of input.assets) {
    let buffer: Buffer;
    try {
      buffer = await readAssetBuffer(asset);
    } catch (error) {
      throw new Error(
        `${input.label} read failed for ${asset.originalName}: ${error instanceof Error ? error.message : "Unknown read error."}`,
      );
    }

    try {
      fileTokens.push(
        await uploadAssetToFeishuBitable({
          accessToken: input.accessToken,
          settings: input.settings,
          asset,
          buffer,
        }),
      );
    } catch (error) {
      const sizeMb = (asset.sizeBytes / (1024 * 1024)).toFixed(2);
      throw new Error(
        `${input.label} upload failed for ${asset.originalName} (${sizeMb} MB): ${
          error instanceof Error ? error.message : "Unknown upload error."
        }`,
      );
    }
  }

  return Array.from(new Set(fileTokens));
}

export async function syncJobToFeishu(input: {
  settings: AppSettings;
  details: JobDetails;
  latestGeneratedAsset?: AssetRecord | null;
  latestAssetBuffer?: Buffer | null;
}) {
  if (!input.settings.feishuSyncEnabled) {
    return null;
  }

  const mapping = parseFeishuFieldMapping(input.settings.feishuFieldMappingJson);
  if (!mapping.image && !mapping.sourceImage) {
    throw new Error("At least one Feishu image field mapping is required.");
  }

  const accessToken = await getFeishuTenantAccessToken(input.settings);
  const existingState = await resolveFeishuRecordState({
    accessToken,
    settings: input.settings,
    mapping,
    job: input.details.job,
  });
  let recordId = existingState.recordId;
  let generatedFileTokens = existingState.generatedFileTokens;
  let sourceFileTokens = existingState.sourceFileTokens;

  if (mapping.sourceImage && sourceFileTokens.length === 0) {
    sourceFileTokens = await uploadAssetsToFeishu({
      accessToken,
      settings: input.settings,
      assets: input.details.sourceAssets,
      label: "Feishu source image",
    });
  }

  if (input.latestGeneratedAsset && input.latestAssetBuffer) {
    let fileToken: string;
    try {
      fileToken = await uploadAssetToFeishuBitable({
        accessToken,
        settings: input.settings,
        asset: input.latestGeneratedAsset,
        buffer: input.latestAssetBuffer,
      });
    } catch (error) {
      const sizeMb = (input.latestAssetBuffer.byteLength / (1024 * 1024)).toFixed(2);
      throw new Error(
        `Feishu image upload failed for ${input.latestGeneratedAsset.originalName} (${sizeMb} MB): ${
          error instanceof Error ? error.message : "Unknown upload error."
        }`,
      );
    }

    generatedFileTokens = Array.from(new Set([...generatedFileTokens, fileToken]));
  }

  if (!recordId && generatedFileTokens.length === 0 && sourceFileTokens.length === 0) {
    return null;
  }

  try {
    return await upsertFeishuTaskRecord({
      accessToken,
      settings: input.settings,
      mapping,
      details: input.details,
      recordId,
      generatedFileTokens,
      sourceFileTokens,
    });
  } catch (error) {
    throw new Error(
      `Feishu record sync failed: ${error instanceof Error ? error.message : "Unknown record sync error."}`,
    );
  }
}

export async function rebuildJobFeishuSync(input: {
  settings: AppSettings;
  details: JobDetails;
}) {
  if (!input.settings.feishuSyncEnabled) {
    return null;
  }

  const mapping = parseFeishuFieldMapping(input.settings.feishuFieldMappingJson);
  if (!mapping.image && !mapping.sourceImage) {
    throw new Error("At least one Feishu image field mapping is required.");
  }

  const accessToken = await getFeishuTenantAccessToken(input.settings);
  const existingState = await resolveFeishuRecordState({
    accessToken,
    settings: input.settings,
    mapping,
    job: input.details.job,
  });
  const generatedFileTokens: string[] = [];
  const sourceFileTokens =
    mapping.sourceImage && input.details.sourceAssets.length > 0
      ? await uploadAssetsToFeishu({
          accessToken,
          settings: input.settings,
          assets: input.details.sourceAssets,
          label: "Feishu source image",
        })
      : existingState.sourceFileTokens;
  const itemResults: Array<{ itemId: string; ok: boolean; message?: string }> = [];

  const { readAssetBuffer } = await import("@/lib/storage");

  for (const item of input.details.items) {
    if (!item.generatedAsset || item.status !== "completed") {
      continue;
    }

    try {
      const buffer = await readAssetBuffer(item.generatedAsset);
      const fileToken = await uploadAssetToFeishuBitable({
        accessToken,
        settings: input.settings,
        asset: item.generatedAsset,
        buffer,
      });
      generatedFileTokens.push(fileToken);
      itemResults.push({ itemId: item.id, ok: true });
    } catch (error) {
      const sizeMb = (item.generatedAsset.sizeBytes / (1024 * 1024)).toFixed(2);
      itemResults.push({
        itemId: item.id,
        ok: false,
        message: `Feishu image upload failed for ${item.generatedAsset.originalName} (${sizeMb} MB): ${
          error instanceof Error ? error.message : "Unknown upload error."
        }`,
      });
    }
  }

  try {
    const upserted = await upsertFeishuTaskRecord({
      accessToken,
      settings: input.settings,
      mapping,
      details: input.details,
      recordId: existingState.recordId,
      generatedFileTokens: Array.from(new Set(generatedFileTokens)),
      sourceFileTokens,
    });

    return {
      ...upserted,
      itemResults,
    };
  } catch (error) {
    throw new Error(
      `Feishu record sync failed: ${error instanceof Error ? error.message : "Unknown record sync error."}`,
    );
  }
}
