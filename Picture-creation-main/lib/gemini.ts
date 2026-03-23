import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { DEFAULT_INLINE_IMAGE_MAX_BYTES, getMaxImagesPerPromptForModel, isGemini3ImageModel } from "./image-model-limits.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { buildPromptModePrompt, normalizeSizeInfoToDualUnits } from "./templates.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import type {
  BrandRecord,
  AppSettings,
  GeneratedCopyBundle,
  ImageType,
  LocalizedCreativeInputs,
  ProviderDebugInfo,
  ReferenceLayoutAnalysis,
  ReferencePosterCopy,
  TemplateRecord,
  UiLanguage,
} from "./types.ts";

const translationSchema = {
  type: "object",
  properties: {
    productName: { type: "string" },
    sellingPoints: { type: "string" },
    restrictions: { type: "string" },
    sourceDescription: { type: "string" },
    materialInfo: { type: "string" },
    sizeInfo: { type: "string" },
  },
} as const;

const copySchema = {
  type: "object",
  required: [
    "optimizedPrompt",
    "title",
    "subtitle",
    "highlights",
    "detailAngles",
    "painPoints",
    "cta",
    "posterHeadline",
    "posterSubline",
  ],
  properties: {
    optimizedPrompt: { type: "string" },
    title: { type: "string" },
    subtitle: { type: "string" },
    highlights: { type: "array", items: { type: "string" } },
    detailAngles: { type: "array", items: { type: "string" } },
    painPoints: { type: "array", items: { type: "string" } },
    cta: { type: "string" },
    posterHeadline: { type: "string" },
    posterSubline: { type: "string" },
  },
} as const;

const referenceLayoutSchema = {
  type: "object",
  required: [
    "summary",
    "posterStyle",
    "backgroundType",
    "primaryProductPlacement",
    "packagingPresent",
    "packagingPlacement",
    "productPackagingRelationship",
    "supportingProps",
    "palette",
    "cameraAngle",
    "depthAndLighting",
    "topBanner",
    "headline",
    "subheadline",
    "bottomBanner",
    "callouts",
  ],
  properties: {
    summary: { type: "string" },
    posterStyle: { type: "string" },
    backgroundType: { type: "string" },
    primaryProductPlacement: { type: "string" },
    packagingPresent: { type: "boolean" },
    packagingPlacement: { type: "string" },
    productPackagingRelationship: { type: "string" },
    supportingProps: { type: "array", items: { type: "string" } },
    palette: { type: "array", items: { type: "string" } },
    cameraAngle: { type: "string" },
    depthAndLighting: { type: "string" },
    topBanner: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        placement: { type: "string" },
        style: { type: "string" },
        sourceText: { type: "string" },
      },
    },
    headline: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        placement: { type: "string" },
        style: { type: "string" },
        sourceText: { type: "string" },
      },
    },
    subheadline: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        placement: { type: "string" },
        style: { type: "string" },
        sourceText: { type: "string" },
      },
    },
    bottomBanner: {
      type: "object",
      properties: {
        present: { type: "boolean" },
        placement: { type: "string" },
        style: { type: "string" },
        sourceText: { type: "string" },
      },
    },
    callouts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          placement: { type: "string" },
          style: { type: "string" },
          sourceText: { type: "string" },
          iconHint: { type: "string" },
        },
      },
    },
  },
} as const;

const promptTranslationSchema = {
  type: "object",
  properties: {
    customPrompt: { type: "string" },
  },
} as const;

const lineTranslationSchema = {
  type: "object",
  required: ["lines"],
  properties: {
    lines: { type: "array", items: { type: "string" } },
  },
} as const;

const CREATIVE_TRANSLATION_FIELD_LABELS = {
  productName: "Product name",
  sellingPoints: "Selling points",
  restrictions: "Restrictions",
  sourceDescription: "Additional notes",
  materialInfo: "Material information",
  sizeInfo: "Size and weight information",
} as const;

type CreativeTranslationFieldKey = keyof typeof CREATIVE_TRANSLATION_FIELD_LABELS;

const referencePosterCopySchema = {
  type: "object",
  required: ["summary", "topBanner", "headline", "subheadline", "bottomBanner", "callouts"],
  properties: {
    summary: { type: "string" },
    topBanner: { type: "string" },
    headline: { type: "string" },
    subheadline: { type: "string" },
    bottomBanner: { type: "string" },
    callouts: { type: "array", items: { type: "string" } },
  },
} as const;

interface ProviderConfig {
  apiKey: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
}

function mimeTypeFromUrl(url: string) {
  const normalized = url.toLowerCase();
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }
  if (normalized.endsWith(".gif")) {
    return "image/gif";
  }
  return "image/png";
}

function extractImageUrlFromText(text: string) {
  const markdownMatch = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownMatch?.[1]) {
    return markdownMatch[1];
  }

  const directMatch = text.match(/https?:\/\/[^\s]+?\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s]*)?/i);
  return directMatch?.[0] ?? null;
}

const PROVIDER_REQUEST_RETRY_DELAYS_MS = [1000, 3000, 8000] as const;
const PROVIDER_IMAGE_MAX_EDGE = 4096;
const PROVIDER_IMAGE_TARGET_BYTES = DEFAULT_INLINE_IMAGE_MAX_BYTES;
const PROVIDER_IMAGE_PRIMARY_JPEG_QUALITY = 92;
const PROVIDER_IMAGE_FALLBACK_JPEG_QUALITY = 82;

async function fetchImageWithRetries(url: string, attempts = 3) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw lastError ?? new Error("Unknown image fetch failure");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRawErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const MULTIMODAL_DIAGNOSTIC_REFERENCE = {
  centerToken: "CENTER-4Q-DIAG",
  topLeftColor: "red",
  topRightColor: "green",
  bottomLeftColor: "blue",
  bottomRightColor: "yellow",
} as const;

const MULTIMODAL_DIAGNOSTIC_TEXT_PROMPT = "Reply with OK only.";
const MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE = 512;
const MULTIMODAL_DIAGNOSTIC_IMAGE_TOKEN = MULTIMODAL_DIAGNOSTIC_REFERENCE.centerToken;
const MULTIMODAL_DIAGNOSTIC_RESPONSE_SCHEMA = {
  type: "object",
  required: [
    "centerToken",
    "topLeftColor",
    "topRightColor",
    "bottomLeftColor",
    "bottomRightColor",
    "confidenceNote",
  ],
  properties: {
    centerToken: { type: "string" },
    topLeftColor: { type: "string" },
    topRightColor: { type: "string" },
    bottomLeftColor: { type: "string" },
    bottomRightColor: { type: "string" },
    confidenceNote: { type: "string" },
  },
} as const;

export type MultimodalDiagnosticBranchName = "relay" | "official";

export interface MultimodalDiagnosticBranchConfig {
  branchName: MultimodalDiagnosticBranchName;
  officialDirect: boolean;
  baseUrlUsed: string | null;
  apiKey: string;
  model: string;
  apiVersion?: string;
  apiHeaders?: string;
}

export interface MultimodalDiagnosticImage {
  mimeType: string;
  buffer: Buffer;
  width: number;
  height: number;
  token: string;
  description: string;
}

export interface MultimodalDiagnosticScore {
  expectedFieldCount: number;
  exactFieldCount: number;
  matchedFieldNames: string[];
  mismatchedFieldNames: string[];
  missingFieldNames: string[];
}

export interface MultimodalDiagnosticScoreResult {
  classification:
    | "exact_match"
    | "partial_match"
    | "text_only_or_no_vision"
    | "request_failed"
    | "auth_or_model_mismatch";
  score: MultimodalDiagnosticScore;
  rawText: string | null;
  jsonParsed: Record<string, unknown> | null;
  error: string | null;
}

function normalizeDiagnosticText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

function normalizeDiagnosticKey(value?: string | null) {
  return normalizeDiagnosticText(value).toLowerCase();
}

function isAuthOrModelMismatchMessage(message: string) {
  return /(401|403|unauthori[sz]ed|forbidden|permission|access denied|invalid model|unsupported model|model .* not found|not found|does not exist|does not support|bad request)/i.test(
    message,
  );
}

function parseMultimodalDiagnosticJson(rawText: string | null) {
  if (!rawText?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

export function buildMultimodalDiagnosticTextPrompt() {
  return MULTIMODAL_DIAGNOSTIC_TEXT_PROMPT;
}

export function buildMultimodalDiagnosticPrompt(reference = MULTIMODAL_DIAGNOSTIC_REFERENCE) {
  return [
    "You are inspecting a synthetic diagnostic image.",
    "Return JSON only with exactly these keys: centerToken, topLeftColor, topRightColor, bottomLeftColor, bottomRightColor, confidenceNote.",
    "Use the image as the source of truth.",
    `The large center token should be reported as centerToken.`,
    `Report the top-left quadrant color as topLeftColor.`,
    `Report the top-right quadrant color as topRightColor.`,
    `Report the bottom-left quadrant color as bottomLeftColor.`,
    `Report the bottom-right quadrant color as bottomRightColor.`,
    "confidenceNote should be a brief note about how certain you are.",
    "Do not add extra keys, markdown, or explanatory text.",
    `Expected response shape: ${JSON.stringify({
      centerToken: reference.centerToken,
      topLeftColor: reference.topLeftColor,
      topRightColor: reference.topRightColor,
      bottomLeftColor: reference.bottomLeftColor,
      bottomRightColor: reference.bottomRightColor,
      confidenceNote: "string",
    })}`,
  ].join("\n");
}

function createDiagnosticQuadrantSvg() {
  const half = MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE / 2;
  const tokenBoxWidth = 290;
  const tokenBoxHeight = 120;
  const tokenBoxX = (MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE - tokenBoxWidth) / 2;
  const tokenBoxY = (MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE - tokenBoxHeight) / 2;

  return Buffer.from(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE}" height="${MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE}" viewBox="0 0 ${MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE} ${MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE}">`,
      `<rect x="0" y="0" width="${half}" height="${half}" fill="#ff1744"/>`,
      `<rect x="${half}" y="0" width="${half}" height="${half}" fill="#00c853"/>`,
      `<rect x="0" y="${half}" width="${half}" height="${half}" fill="#2962ff"/>`,
      `<rect x="${half}" y="${half}" width="${half}" height="${half}" fill="#ffd600"/>`,
      `<rect x="${tokenBoxX}" y="${tokenBoxY}" rx="20" ry="20" width="${tokenBoxWidth}" height="${tokenBoxHeight}" fill="#111111" stroke="#ffffff" stroke-width="8"/>`,
      `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-size="68" font-weight="800" font-family="Arial, Helvetica, sans-serif">${MULTIMODAL_DIAGNOSTIC_IMAGE_TOKEN}</text>`,
      `</svg>`,
    ].join(""),
  );
}

export async function createDeterministicMultimodalDiagnosticImage(): Promise<MultimodalDiagnosticImage> {
  const svg = createDiagnosticQuadrantSvg();
  const buffer = await sharp(svg).png().toBuffer();

  return {
    mimeType: "image/png",
    buffer,
    width: MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE,
    height: MULTIMODAL_DIAGNOSTIC_IMAGE_SIZE,
    token: MULTIMODAL_DIAGNOSTIC_REFERENCE.centerToken,
    description: "Synthetic four-quadrant diagnostic image with a large center token.",
  };
}

export function buildMultimodalDiagnosticBranchConfig(
  branchName: MultimodalDiagnosticBranchName,
  settings: Partial<AppSettings> & {
    officialApiKey?: string;
    officialTextModel?: string;
    officialApiVersion?: string;
    officialApiHeaders?: string;
  },
): MultimodalDiagnosticBranchConfig {
  const isOfficial = branchName === "official";

  if (!isOfficial) {
    return {
      branchName,
      officialDirect: false,
      baseUrlUsed: normalizeDiagnosticText(settings.defaultApiBaseUrl) || null,
      apiKey: settings.defaultApiKey ?? "",
      model: settings.defaultTextModel ?? "",
      apiVersion: settings.defaultApiVersion || undefined,
      apiHeaders: normalizeDiagnosticText(settings.defaultApiHeaders) || undefined,
    };
  }

  return {
    branchName,
    officialDirect: true,
    baseUrlUsed: null,
    apiKey: normalizeDiagnosticText(settings.officialApiKey) || settings.defaultApiKey || "",
    model: normalizeDiagnosticText(settings.officialTextModel) || settings.defaultTextModel || "",
    apiVersion: normalizeDiagnosticText(settings.officialApiVersion) || settings.defaultApiVersion || undefined,
    apiHeaders: normalizeDiagnosticText(settings.officialApiHeaders) || undefined,
  };
}

export function scoreMultimodalDiagnosticResponse(input: {
  expected: typeof MULTIMODAL_DIAGNOSTIC_REFERENCE;
  rawText?: string | null;
  jsonParsed?: Record<string, unknown> | null;
  error?: unknown;
}): MultimodalDiagnosticScoreResult {
  const rawText = input.rawText ?? null;
  const jsonParsed = input.jsonParsed ?? parseMultimodalDiagnosticJson(rawText);

  if (input.error) {
    const errorMessage = extractRawErrorMessage(input.error);
    return {
      classification: isAuthOrModelMismatchMessage(errorMessage) ? "auth_or_model_mismatch" : "request_failed",
      score: {
        expectedFieldCount: 6,
        exactFieldCount: 0,
        matchedFieldNames: [],
        mismatchedFieldNames: ["centerToken", "topLeftColor", "topRightColor", "bottomLeftColor", "bottomRightColor", "confidenceNote"],
        missingFieldNames: ["centerToken", "topLeftColor", "topRightColor", "bottomLeftColor", "bottomRightColor", "confidenceNote"],
      },
      rawText,
      jsonParsed,
      error: errorMessage,
    };
  }

  if (!jsonParsed) {
    return {
      classification: "text_only_or_no_vision",
      score: {
        expectedFieldCount: 6,
        exactFieldCount: 0,
        matchedFieldNames: [],
        mismatchedFieldNames: ["centerToken", "topLeftColor", "topRightColor", "bottomLeftColor", "bottomRightColor", "confidenceNote"],
        missingFieldNames: ["centerToken", "topLeftColor", "topRightColor", "bottomLeftColor", "bottomRightColor", "confidenceNote"],
      },
      rawText,
      jsonParsed: null,
      error: null,
    };
  }

  const expectedFields = [
    ["centerToken", input.expected.centerToken],
    ["topLeftColor", input.expected.topLeftColor],
    ["topRightColor", input.expected.topRightColor],
    ["bottomLeftColor", input.expected.bottomLeftColor],
    ["bottomRightColor", input.expected.bottomRightColor],
  ] as const;

  const matchedFieldNames: string[] = [];
  const mismatchedFieldNames: string[] = [];
  const missingFieldNames: string[] = [];

  for (const [fieldName, expectedValue] of expectedFields) {
    const actualValue = normalizeDiagnosticKey(typeof jsonParsed[fieldName] === "string" ? (jsonParsed[fieldName] as string) : null);
    if (!actualValue) {
      missingFieldNames.push(fieldName);
      continue;
    }

    if (actualValue === normalizeDiagnosticKey(expectedValue)) {
      matchedFieldNames.push(fieldName);
    } else {
      mismatchedFieldNames.push(fieldName);
    }
  }

  const confidenceNote = normalizeDiagnosticText(typeof jsonParsed.confidenceNote === "string" ? (jsonParsed.confidenceNote as string) : null);
  const exactFieldCount = matchedFieldNames.length;
  const hasMeaningfulVisionMatch = exactFieldCount > 0;

  return {
    classification:
      exactFieldCount === 5 && confidenceNote
        ? "exact_match"
        : hasMeaningfulVisionMatch && confidenceNote
          ? "partial_match"
          : hasMeaningfulVisionMatch
            ? "request_failed"
            : "text_only_or_no_vision",
    score: {
      expectedFieldCount: 6,
      exactFieldCount,
      matchedFieldNames,
      mismatchedFieldNames,
      missingFieldNames,
    },
    rawText,
    jsonParsed,
    error: null,
  };
}

export function validateMultimodalDiagnosticTextProbeResponse(rawText?: string | null) {
  const normalizedText = normalizeDiagnosticText(rawText);

  if (normalizedText === "OK") {
    return {
      ok: true,
      rawText: normalizedText,
      error: null as string | null,
    };
  }

  return {
    ok: false,
    rawText: normalizedText || null,
    error: normalizedText ? `Expected OK only, received: ${normalizedText}` : "Provider returned an empty text response.",
  };
}

export function resolveMultimodalDiagnosticFinalVerdict(input: {
  relay: {
    textProbe: { ok: boolean };
    multimodalProbe: { classification: MultimodalDiagnosticScoreResult["classification"] };
  };
  official: {
    textProbe: { ok: boolean };
    multimodalProbe: { classification: MultimodalDiagnosticScoreResult["classification"] };
  };
}) {
  const relayOk = input.relay.multimodalProbe.classification === "exact_match" || input.relay.multimodalProbe.classification === "partial_match";
  const officialOk =
    input.official.multimodalProbe.classification === "exact_match" || input.official.multimodalProbe.classification === "partial_match";

  if (relayOk) {
    return "relay_multimodal_ok";
  }

  if (officialOk) {
    return "official_ok_relay_failed";
  }

  if (input.relay.textProbe.ok && input.relay.multimodalProbe.classification === "text_only_or_no_vision") {
    return "relay_text_ok_but_multimodal_failed";
  }

  if (input.relay.textProbe.ok && input.official.textProbe.ok) {
    return "both_multimodal_failed";
  }

  return "official_inconclusive";
}

async function runDiagnosticTextProbe(input: ProviderConfig & { textModel: string }) {
  const ai = createClient(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: buildMultimodalDiagnosticTextPrompt(),
  });

  return response.text ?? "";
}

async function runDiagnosticMultimodalProbe(
  input: ProviderConfig & { textModel: string },
  sentImage?: MultimodalDiagnosticImage,
) {
  const ai = createClient(input);
  const image = sentImage ?? (await createDeterministicMultimodalDiagnosticImage());
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      {
        inlineData: {
          mimeType: image.mimeType,
          data: image.buffer.toString("base64"),
        },
      },
      {
        text: buildMultimodalDiagnosticPrompt(),
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: MULTIMODAL_DIAGNOSTIC_RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  return {
    rawText: response.text ?? "",
    sentImage: image,
  };
}

export async function testMultimodalDiagnosticTextProbe(input: ProviderConfig & { textModel: string }) {
  try {
    const rawText = await runDiagnosticTextProbe(input);
    return validateMultimodalDiagnosticTextProbeResponse(rawText);
  } catch (error) {
    return { ok: false, rawText: null as string | null, error: extractRawErrorMessage(error) };
  }
}

export async function testMultimodalDiagnosticProbe(input: ProviderConfig & { textModel: string }, sentImage?: MultimodalDiagnosticImage) {
  try {
    const { rawText, sentImage: image } = await runDiagnosticMultimodalProbe(input, sentImage);
    const jsonParsed = parseMultimodalDiagnosticJson(rawText);
    const scored = scoreMultimodalDiagnosticResponse({
      expected: MULTIMODAL_DIAGNOSTIC_REFERENCE,
      rawText,
      jsonParsed,
    });

    return {
      ok: scored.classification === "exact_match" || scored.classification === "partial_match",
      rawText,
      jsonParsed,
      classification: scored.classification,
      score: scored.score,
      sentImage: image,
      error: null as string | null,
    };
  } catch (error) {
    const errorMessage = extractRawErrorMessage(error);
    const scored = scoreMultimodalDiagnosticResponse({
      expected: MULTIMODAL_DIAGNOSTIC_REFERENCE,
      rawText: null,
      jsonParsed: null,
      error,
    });

    return {
      ok: false,
      rawText: null as string | null,
      jsonParsed: null as Record<string, unknown> | null,
      classification: scored.classification,
      score: scored.score,
      sentImage: sentImage ?? (await createDeterministicMultimodalDiagnosticImage()),
      error: errorMessage,
    };
  }
}

function isRetryableProviderRequestError(error: unknown) {
  return /(fetch failed|network|socket|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|HTTP 5\d{2}|HTTP 429|rate limit)/i.test(
    extractRawErrorMessage(error),
  );
}

async function waitForProviderRetry(attempt: number) {
  const baseDelay = PROVIDER_REQUEST_RETRY_DELAYS_MS[Math.max(0, attempt - 1)] ?? PROVIDER_REQUEST_RETRY_DELAYS_MS.at(-1)!;
  const jitter = Math.floor(Math.random() * 300);
  await sleep(baseDelay + jitter);
}

function getResizeDimensions(width?: number, height?: number) {
  if (!width || !height) {
    return null;
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= PROVIDER_IMAGE_MAX_EDGE) {
    return null;
  }

  const scale = PROVIDER_IMAGE_MAX_EDGE / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function prepareImageForProvider(image: { mimeType: string; buffer: Buffer }) {
  const baseImage = sharp(image.buffer, { failOn: "none" });
  const metadata = await baseImage.metadata();
  const resizeDimensions = getResizeDimensions(metadata.width, metadata.height);
  const needsResize = Boolean(resizeDimensions);
  const hasAlpha = Boolean(metadata.hasAlpha);
  const shouldKeepOriginal = !needsResize && image.buffer.length <= PROVIDER_IMAGE_TARGET_BYTES;

  if (shouldKeepOriginal) {
    return image;
  }

  const makePipeline = () => {
    const pipeline = sharp(image.buffer, { failOn: "none" });
    if (resizeDimensions) {
      pipeline.resize({
        width: resizeDimensions.width,
        height: resizeDimensions.height,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    return pipeline;
  };

  if (image.mimeType === "image/png" || hasAlpha) {
    const pngBuffer = await makePipeline()
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
      })
      .toBuffer();

    if (pngBuffer.length <= PROVIDER_IMAGE_TARGET_BYTES) {
      return { mimeType: "image/png", buffer: pngBuffer };
    }
  }

  if (image.mimeType === "image/webp") {
    const webpBuffer = await makePipeline()
      .webp({
        quality: 92,
      })
      .toBuffer();

    if (webpBuffer.length <= PROVIDER_IMAGE_TARGET_BYTES) {
      return { mimeType: "image/webp", buffer: webpBuffer };
    }
  }

  const primaryJpegBuffer = await makePipeline()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: PROVIDER_IMAGE_PRIMARY_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  if (primaryJpegBuffer.length <= PROVIDER_IMAGE_TARGET_BYTES) {
    return { mimeType: "image/jpeg", buffer: primaryJpegBuffer };
  }

  const fallbackJpegBuffer = await makePipeline()
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: PROVIDER_IMAGE_FALLBACK_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  return { mimeType: "image/jpeg", buffer: fallbackJpegBuffer };
}

function parseHeadersJson(rawHeaders?: string): Record<string, string> | undefined {
  if (!rawHeaders?.trim()) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawHeaders);
  } catch {
    throw new Error("Custom headers JSON is invalid. Please use a valid JSON object.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Custom headers JSON must be an object, for example {\"Authorization\":\"Bearer xxx\"}.");
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error(`Custom header ${key} must be a string value.`);
    }
    headers[key] = value;
  }

  return headers;
}

function createClient(config: ProviderConfig) {
  const baseUrl = config.apiBaseUrl?.trim();
  const apiVersion = config.apiVersion?.trim();
  const headers = parseHeadersJson(config.apiHeaders);

  return new GoogleGenAI({
    apiKey: config.apiKey,
    apiVersion: apiVersion || undefined,
    httpOptions: {
      baseUrl: baseUrl || undefined,
      headers,
    },
  });
}

const LEGACY_HALF_K_PROVIDER_ERROR_MESSAGE =
  "Resolution 0.5K is no longer supported by the provider. Please select 1K, 2K, or 4K.";

function parseProviderErrorEnvelope(raw: string) {
  try {
    return JSON.parse(raw) as { error?: { message?: string; status?: string } };
  } catch {
    return null;
  }
}

function isLegacyHalfKInvalidArgumentMessage(message: string | undefined) {
  if (!message) {
    return false;
  }

  return (
    /INVALID_ARGUMENT/i.test(message) &&
    /(0\.5K|512px)/i.test(message) &&
    /(resolution_label|image_size|imagesize)/i.test(message)
  );
}

export function normalizeProviderError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const parsed = parseProviderErrorEnvelope(raw);
  const parsedProviderMessage = parsed?.error?.message;
  const parsedProviderStatus = parsed?.error?.status;

  if (error && typeof error === "object" && "providerDebug" in error) {
    const providerDebug = (error as { providerDebug?: ProviderDebugInfo | null }).providerDebug;
    if (providerDebug?.failureStage === "provider-request") {
      const providerRequestMessagePool = [providerDebug.failureReason, parsedProviderMessage, raw];
      if (providerRequestMessagePool.some((message) => isLegacyHalfKInvalidArgumentMessage(message))) {
        return LEGACY_HALF_K_PROVIDER_ERROR_MESSAGE;
      }

      return "Provider request failed before a response was returned.";
    }
  }

  if (parsedProviderMessage) {
    return parsedProviderStatus ? `${parsedProviderMessage} (${parsedProviderStatus})` : parsedProviderMessage;
  }

  return raw;
}

function normalizePromptText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizePromptCategory(category?: string | null) {
  const trimmed = normalizePromptText(category);
  if (!trimmed || trimmed === "general") {
    return null;
  }

  return trimmed;
}

function buildPromptFactLine(facts: Array<[label: string, value?: string | null]>) {
  const parts = facts.flatMap(([label, value]) => {
    const normalized = normalizePromptText(value);
    return normalized ? [`${label}: ${normalized}`] : [];
  });

  return parts.length ? `${parts.join(". ")}.` : null;
}

function buildSimplifiedChineseOnlyLine(language: string) {
  return language.toLowerCase().startsWith("zh")
    ? "If any Chinese text appears anywhere in the output, use Simplified Chinese only. Do not use Traditional Chinese."
    : null;
}

function isCjkTargetLanguage(language: string) {
  return /^(zh|ja|ko)/i.test(language.trim());
}

function containsHanCharacters(value: string) {
  return /[\u3400-\u9fff]/u.test(value);
}

function containsLatinWords(value: string) {
  return /[A-Za-z]{3,}/.test(value);
}

function shouldBackfillCreativeFieldTranslation(input: {
  language: string;
  original?: string | null;
  translated?: string | null;
}) {
  const normalizedOriginal = normalizePromptText(input.original);
  if (!normalizedOriginal) {
    return false;
  }

  const normalizedTranslated = normalizePromptText(input.translated);
  if (!normalizedTranslated) {
    return true;
  }

  const targetLanguage = input.language.trim().toLowerCase();
  if (targetLanguage.startsWith("zh")) {
    return containsLatinWords(normalizedOriginal) && !containsHanCharacters(normalizedTranslated) && normalizedOriginal === normalizedTranslated;
  }

  if (!isCjkTargetLanguage(targetLanguage)) {
    return containsHanCharacters(normalizedOriginal) && containsHanCharacters(normalizedTranslated);
  }

  return false;
}

async function translateCreativeFieldsFallback(input: ProviderConfig & {
  textModel: string;
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  sku: string;
  fields: Partial<Record<CreativeTranslationFieldKey, string>>;
}) {
  const fieldEntries = (Object.entries(input.fields) as Array<[CreativeTranslationFieldKey, string | undefined]>).filter(
    ([, value]) => Boolean(value?.trim()),
  ) as Array<[CreativeTranslationFieldKey, string]>;

  if (!fieldEntries.length) {
    return {} as Partial<Record<CreativeTranslationFieldKey, string>>;
  }

  const ai = createClient(input);
  const repairedEntries = await Promise.all(
    fieldEntries.map(async ([field, value]) => {
      const sourceLines = value.split(/\r?\n/);
      const lines = [
        "You are a localization specialist for e-commerce creative production.",
        `Translate the following ${CREATIVE_TRANSLATION_FIELD_LABELS[field]} into the target output language ${input.language} for market ${input.country}.`,
        buildSimplifiedChineseOnlyLine(input.language),
        [
          `Target platform: ${input.platform}`,
          normalizePromptCategory(input.category) ? `Product category: ${normalizePromptCategory(input.category)}` : null,
        ]
          .filter(Boolean)
          .join(". ") + ".",
        "Rules:",
        "- Return JSON only in the form {\"lines\": [ ... ]}.",
        `- Return exactly ${sourceLines.length} items in the lines array, in the same order as the input lines.`,
        "- Translate every non-empty input line. Do not leave source-language wording unchanged unless it is a brand name, SKU, model number, unit, or proper noun that should stay as-is.",
        "- Preserve line breaks, list structure, and concise merchandising tone.",
        "- Do not merge multiple input lines into one output line.",
        "- Do not add new claims or unsupported details.",
        "- If a line includes size or weight in only one unit system, keep the original unit and add the corresponding metric or imperial conversion in parentheses.",
        buildPromptFactLine([["Brand name reference", input.brandName]]),
        buildPromptFactLine([["SKU reference", input.sku]]),
        "Input lines:",
        ...sourceLines.map((line, index) => `${index + 1}. ${line.trim() || "[EMPTY LINE]"}`),
      ];

      const response = await ai.models.generateContent({
        model: input.textModel,
        contents: lines.filter(Boolean).join("\n"),
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: lineTranslationSchema,
          temperature: 0.1,
        },
      });

      const parsed = JSON.parse(response.text ?? "{}") as { lines?: string[] };
      const translatedLines = Array.isArray(parsed.lines) ? parsed.lines : [];
      const translatedValue = sourceLines
        .map((line, index) => {
          if (!line.trim()) {
            return "";
          }

          const translatedLine = translatedLines[index]?.trim();
          return translatedLine && translatedLine !== "[EMPTY LINE]" ? translatedLine : line.trim();
        })
        .join("\n")
        .trim();

      return [field, translatedValue || value] as const;
    }),
  );

  return repairedEntries.reduce<Partial<Record<CreativeTranslationFieldKey, string>>>((accumulator, [field, value]) => {
    accumulator[field] = value;
    return accumulator;
  }, {});
}

function buildRestrictionsLine(restrictions?: string | null) {
  return buildPromptFactLine([["Restrictions", restrictions]]);
}

function buildReferenceZoneLine(
  label: string,
  zone?: { present?: boolean; sourceText?: string | null },
) {
  if (!zone?.present) {
    return `${label} present: false.`;
  }

  const sourceTextLine = buildPromptFactLine([[`${label} source text`, zone.sourceText]]);
  return [ `${label} present: true.`, sourceTextLine].filter(Boolean).join(" ");
}

export async function testProviderConnection(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
}) {
  const ai = createClient(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: buildMultimodalDiagnosticTextPrompt(),
  });

  return response.text ?? "OK";
}

export async function translateCreativeInputs(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  sku: string;
  productName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
}): Promise<LocalizedCreativeInputs | null> {
  const hasProductName = Boolean(input.productName.trim());
  const hasSellingPoints = Boolean(input.sellingPoints.trim());
  const hasRestrictions = Boolean(input.restrictions.trim());
  const hasSourceDescription = Boolean(input.sourceDescription.trim());
  const hasMaterialInfo = Boolean(input.materialInfo?.trim());
  const hasSizeInfo = Boolean(input.sizeInfo?.trim());
  const normalizedSizeInfo = hasSizeInfo ? normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo?.trim() ?? "" : "";

  if (!hasProductName && !hasSellingPoints && !hasRestrictions && !hasSourceDescription && !hasMaterialInfo && !hasSizeInfo) {
    return null;
  }

  const lines = [
    "You are a localization specialist for e-commerce creative production.",
    `Translate the following user-provided product fields into the target output language ${input.language} for market ${input.country}.`,
    buildSimplifiedChineseOnlyLine(input.language),
    [
      `Target platform: ${input.platform}`,
      normalizePromptCategory(input.category) ? `Product category: ${normalizePromptCategory(input.category)}` : null,
    ]
      .filter(Boolean)
      .join(". ") + ".",
    "Rules:",
    "- Keep brand names, SKU, model numbers, measurements, units, and proper nouns unchanged unless a natural localized format is clearly better.",
    "- Preserve meaning faithfully and keep the result concise, natural, and suitable for prompt generation and marketing copy.",
    "- If a field is already appropriate for the target language, keep it with only light normalization.",
    "- Do not add any new claims or unsupported details.",
    "- If size or weight information is provided in only one unit system, keep the original unit and add the corresponding metric or imperial conversion in parentheses.",
    "- Only return keys for fields that were actually provided with non-empty content.",
    buildPromptFactLine([["Brand name reference", input.brandName]]),
    buildPromptFactLine([["SKU reference", input.sku]]),
  ];

  if (hasProductName) {
    lines.push(`Product name: ${input.productName}`);
  }
  if (hasSellingPoints) {
    lines.push(`Selling points: ${input.sellingPoints}`);
  }
  if (hasRestrictions) {
    lines.push(`Restrictions: ${input.restrictions}`);
  }
  if (hasSourceDescription) {
    lines.push(`Additional notes: ${input.sourceDescription}`);
  }
  if (hasMaterialInfo) {
    lines.push(`Material information: ${input.materialInfo?.trim()}`);
  }
  if (hasSizeInfo) {
    lines.push(`Size and weight information: ${normalizedSizeInfo}`);
  }

  lines.push("Return JSON only.");

  const ai = createClient(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: lines.filter(Boolean).join("\n"),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: translationSchema,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    productName?: string;
    sellingPoints?: string;
    restrictions?: string;
    sourceDescription?: string;
    materialInfo?: string;
    sizeInfo?: string;
  };

  const localizedInputs: LocalizedCreativeInputs = {
    productName: hasProductName ? parsed.productName?.trim() || input.productName : "",
    sellingPoints: hasSellingPoints ? parsed.sellingPoints?.trim() || input.sellingPoints : "",
    restrictions: hasRestrictions ? parsed.restrictions?.trim() || input.restrictions : "",
    sourceDescription: hasSourceDescription ? parsed.sourceDescription?.trim() || input.sourceDescription : "",
    materialInfo: hasMaterialInfo ? parsed.materialInfo?.trim() || input.materialInfo?.trim() || "" : "",
    sizeInfo: hasSizeInfo ? parsed.sizeInfo?.trim() || input.sizeInfo?.trim() || "" : "",
  };

  const fallbackFields: Partial<Record<CreativeTranslationFieldKey, string>> = {};

  if (
    hasProductName &&
    shouldBackfillCreativeFieldTranslation({
      language: input.language,
      original: input.productName,
      translated: localizedInputs.productName,
    })
  ) {
    fallbackFields.productName = input.productName;
  }

  if (
    hasSellingPoints &&
    shouldBackfillCreativeFieldTranslation({
      language: input.language,
      original: input.sellingPoints,
      translated: localizedInputs.sellingPoints,
    })
  ) {
    fallbackFields.sellingPoints = input.sellingPoints;
  }

  if (
    hasRestrictions &&
    shouldBackfillCreativeFieldTranslation({
      language: input.language,
      original: input.restrictions,
      translated: localizedInputs.restrictions,
    })
  ) {
    fallbackFields.restrictions = input.restrictions;
  }

  if (
    hasSourceDescription &&
    shouldBackfillCreativeFieldTranslation({
      language: input.language,
      original: input.sourceDescription,
      translated: localizedInputs.sourceDescription,
    })
  ) {
    fallbackFields.sourceDescription = input.sourceDescription;
  }

  if (
    hasMaterialInfo &&
    shouldBackfillCreativeFieldTranslation({
      language: input.language,
      original: input.materialInfo,
      translated: localizedInputs.materialInfo,
    })
  ) {
    fallbackFields.materialInfo = input.materialInfo?.trim();
  }

  if (
    hasSizeInfo &&
    shouldBackfillCreativeFieldTranslation({
      language: input.language,
      original: input.sizeInfo,
      translated: localizedInputs.sizeInfo,
    })
  ) {
    fallbackFields.sizeInfo = input.sizeInfo?.trim();
  }

  const repairedFields =
    Object.keys(fallbackFields).length > 0
      ? await translateCreativeFieldsFallback({
          apiKey: input.apiKey,
          textModel: input.textModel,
          apiBaseUrl: input.apiBaseUrl,
          apiVersion: input.apiVersion,
          apiHeaders: input.apiHeaders,
          country: input.country,
          language: input.language,
          platform: input.platform,
          category: input.category,
          brandName: input.brandName,
          sku: input.sku,
          fields: fallbackFields,
        }).catch(() => null)
      : null;

  return {
    productName: repairedFields?.productName?.trim() || localizedInputs.productName,
    sellingPoints: repairedFields?.sellingPoints?.trim() || localizedInputs.sellingPoints,
    restrictions: repairedFields?.restrictions?.trim() || localizedInputs.restrictions,
    sourceDescription: repairedFields?.sourceDescription?.trim() || localizedInputs.sourceDescription,
    materialInfo: repairedFields?.materialInfo?.trim() || localizedInputs.materialInfo,
    sizeInfo: repairedFields?.sizeInfo?.trim() || localizedInputs.sizeInfo,
  };
}

function normalizeParsedCopyBundle(parsed: Partial<GeneratedCopyBundle>): GeneratedCopyBundle {
  return {
    optimizedPrompt: parsed.optimizedPrompt as string,
    title: parsed.title as string,
    subtitle: parsed.subtitle as string,
    highlights: parsed.highlights ?? [],
    detailAngles: parsed.detailAngles ?? [],
    painPoints: parsed.painPoints ?? [],
    cta: parsed.cta as string,
    posterHeadline: parsed.posterHeadline as string,
    posterSubline: parsed.posterSubline as string,
  };
}

function normalizeCopyFallbackLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed || /^```/.test(trimmed)) {
    return "";
  }

  return trimmed
    .replace(/^#{1,6}\s+/, "")
    .replace(/^>\s*/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function extractCopyLabeledValue(lines: string[], patterns: RegExp[]) {
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]?.trim()) {
        return match[1].trim();
      }
    }
  }

  return "";
}

function stripCopyLabelPrefix(line: string) {
  return line
    .replace(
      /^(?:optimized\s*prompt|prompt(?:\s*draft)?|title|headline|poster\s*headline|subtitle|subline|poster\s*subline|primary value prop(?:osition)?|cta)\s*[:：-]\s*/i,
      "",
    )
    .trim();
}

function buildCopyBundleFromPlainText(rawText: string | undefined, productName: string): GeneratedCopyBundle {
  const normalizedLines = (rawText ?? "")
    .split(/\r?\n/)
    .map(normalizeCopyFallbackLine)
    .filter((line) => Boolean(line) && !/^(shared analysis layer|prompt draft)$/i.test(line));

  const titleCandidate = extractCopyLabeledValue(normalizedLines, [
    /^(?:title|headline|poster\s*headline)\s*[:：-]\s*(.+)$/i,
  ]);
  const valuePropCandidate = extractCopyLabeledValue(normalizedLines, [/^primary value prop(?:osition)?\s*[:：-]\s*(.+)$/i]);
  const subtitleCandidate = extractCopyLabeledValue(normalizedLines, [
    /^(?:subtitle|subline|poster\s*subline)\s*[:：-]\s*(.+)$/i,
  ]);
  const ctaCandidate = extractCopyLabeledValue(normalizedLines, [/^cta\s*[:：-]\s*(.+)$/i]);
  const promptCandidate = extractCopyLabeledValue(normalizedLines, [/^(?:optimized\s*prompt|prompt(?:\s*draft)?)\s*[:：-]\s*(.+)$/i]);
  const normalizedProductName = productName.trim();
  const fallbackTitle = titleCandidate || normalizedProductName || "Product image";
  const promptBody = normalizedLines.map(stripCopyLabelPrefix).filter(Boolean).join("\n").trim();
  const optimizedPrompt = promptCandidate || promptBody || fallbackTitle;

  return {
    optimizedPrompt,
    title: fallbackTitle,
    subtitle: subtitleCandidate || valuePropCandidate || "",
    highlights: valuePropCandidate ? [valuePropCandidate] : [],
    detailAngles: [],
    painPoints: [],
    cta: ctaCandidate || "",
    posterHeadline: titleCandidate || fallbackTitle,
    posterSubline: subtitleCandidate || valuePropCandidate || "",
  };
}

export function parseCopyBundleResponse(rawText: string | undefined, productName: string): GeneratedCopyBundle {
  try {
    const parsed = JSON.parse(rawText ?? "{}") as Partial<GeneratedCopyBundle>;
    return normalizeParsedCopyBundle(parsed);
  } catch {
    return buildCopyBundleFromPlainText(rawText, productName);
  }
}

export async function optimizeUserImagePrompt(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  customPrompt: string;
  translateToOutputLanguage?: boolean;
  hasSourceImages?: boolean;
}): Promise<string> {
  const ai = createClient(input);
  const category = normalizePromptCategory(input.category);
  const preserveOriginalLanguage = !input.translateToOutputLanguage;
  const normalizedSizeInfo = normalizeSizeInfoToDualUnits(input.sizeInfo);
  const lines = [
    "You are an e-commerce image prompt optimizer.",
    preserveOriginalLanguage
      ? "Rewrite the user's image prompt into one strong plain-text prompt while preserving the user's original language. Use the market and platform context only as creative constraints, not as a translation instruction."
      : `Rewrite the user's image prompt into one strong plain-text prompt for ${input.platform} in ${input.language} for market ${input.country}.`,
    input.translateToOutputLanguage ? buildSimplifiedChineseOnlyLine(input.language) : null,
    "Return plain text only. Do not return JSON, markdown, bullet lists, or explanations.",
    "Keep the user's main creative intent, but make it more image-model friendly, concise, commercially usable, and strongly oriented toward realistic photography.",
    "Optimization goal: produce a prompt that is more likely to generate a believable real photo rather than an illustration, CGI render, or stylized poster.",
    "Prioritize natural lighting, realistic shadows, credible camera perspective, physically plausible materials, true-to-life texture, accurate scale, and premium commercial product photography quality.",
    "Prefer wording that suggests a real photographed scene, realistic lens behavior, authentic reflections, and grounded background detail.",
    "Avoid pushing the output toward illustration, cartoon styling, obvious 3D rendering, plastic-looking surfaces, surreal props, or fake-looking text overlays unless the user explicitly asked for that.",
    input.hasSourceImages
      ? "Always preserve the uploaded product identity, shape, material, label placement, and key visual truth."
      : "No source images are provided. Treat this as a text-to-image product brief rather than an image-edit or text-transformation task.",
    preserveOriginalLanguage ? "Preserve the user's original prompt language in the final optimized result." : `Output the final optimized prompt in ${input.language}.`,
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
      ["Category", category],
    ]),
    buildPromptFactLine([["Selling points", input.sellingPoints]]),
    buildPromptFactLine([["Additional notes", input.sourceDescription]]),
    buildPromptFactLine([["Material information", input.materialInfo]]),
    buildPromptFactLine([["Size and weight information", normalizedSizeInfo]]),
    buildRestrictionsLine(input.restrictions),
    `Preferred image type: ${input.imageType}.`,
    `Target aspect ratio: ${input.ratio}. Resolution bucket: ${input.resolutionLabel}.`,
    normalizedSizeInfo
      ? "If measurements or weight appear anywhere in the optimized prompt, keep them in dual units and preserve the original primary system first."
      : null,
    `User prompt: ${input.customPrompt}`,
  ].filter(Boolean);

  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: lines.join("\n"),
    config: {
      temperature: 0.35,
    },
  });

  return (response.text ?? input.customPrompt).trim();
}

export async function translateUserPromptInputs(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  country: string;
  language: string;
  platform: string;
  customPrompt: string;
}): Promise<{ customPrompt: string }> {
  const hasPrompt = Boolean(input.customPrompt.trim());

  if (!hasPrompt) {
    return {
      customPrompt: input.customPrompt,
    };
  }

  const lines = [
    "You are a localization specialist for image-generation prompts.",
    `Translate the user's prompt content into the target output language ${input.language} for market ${input.country} and platform ${input.platform}.`,
    buildSimplifiedChineseOnlyLine(input.language),
    "Rules:",
    "- Return JSON only.",
    "- Preserve the user's visual intent faithfully.",
    "- Keep the result concise and image-model friendly, but do not rewrite or optimize beyond translation and light normalization.",
    "- If the text is already appropriate for the target language, keep it with only light normalization.",
    "- Keep brand names, product names, units, model names, and proper nouns unchanged unless a natural localized form is clearly better.",
    "- Do not add new claims, details, or styling instructions that were not present in the source text.",
  ];

  if (hasPrompt) {
    lines.push(`Prompt: ${input.customPrompt}`);
  }

  const ai = createClient(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: lines.join("\n"),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: promptTranslationSchema,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as {
    customPrompt?: string;
  };

  return {
    customPrompt: hasPrompt ? parsed.customPrompt?.trim() || input.customPrompt.trim() : "",
  };
}

function uiLanguageName(uiLanguage: UiLanguage) {
  return uiLanguage === "zh" ? "Simplified Chinese" : "English";
}

function normalizeReferenceZone(zone?: {
  present?: boolean;
  placement?: string;
  style?: string;
  sourceText?: string;
}) {
  return {
    present: Boolean(zone?.present),
    placement: zone?.placement?.trim() || "",
    style: zone?.style?.trim() || "",
    sourceText: zone?.sourceText?.trim() || "",
  };
}

export async function analyzeReferenceLayout(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  uiLanguage: UiLanguage;
  referenceImage: { mimeType: string; buffer: Buffer };
}): Promise<ReferenceLayoutAnalysis> {
  const ai = createClient(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      {
        inlineData: {
          mimeType: input.referenceImage.mimeType,
          data: input.referenceImage.buffer.toString("base64"),
        },
      },
      {
        text: [
          "You are analyzing an e-commerce poster reference image for a poster remake workflow.",
          `Return descriptions in ${uiLanguageName(input.uiLanguage)}.`,
          input.uiLanguage === "zh"
            ? "If any Chinese text appears in the analysis, use Simplified Chinese only. Do not use Traditional Chinese."
            : null,
          "Identify the poster structure precisely instead of summarizing it loosely.",
          "Focus on layout and composition, not only product category.",
          "Extract whether the poster contains: top banner, main headline, subheadline, bottom banner, callout badges, packaging/secondary product, background scene, props, and main product placement.",
          "The implementer will later replace the reference product with another uploaded product, so describe the structure in a reusable way.",
          "For text zones, capture whether they exist, where they are, their visual style, and the original text if readable.",
          "Return JSON only.",
        ].join("\n"),
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: referenceLayoutSchema,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as Partial<ReferenceLayoutAnalysis>;
  return {
    summary: parsed.summary?.trim() || "",
    posterStyle: parsed.posterStyle?.trim() || "",
    backgroundType: parsed.backgroundType?.trim() || "",
    primaryProductPlacement: parsed.primaryProductPlacement?.trim() || "",
    packagingPresent: Boolean(parsed.packagingPresent),
    packagingPlacement: parsed.packagingPlacement?.trim() || "",
    productPackagingRelationship: parsed.productPackagingRelationship?.trim() || "",
    supportingProps: (parsed.supportingProps ?? []).map((value) => value.trim()).filter(Boolean),
    palette: (parsed.palette ?? []).map((value) => value.trim()).filter(Boolean),
    cameraAngle: parsed.cameraAngle?.trim() || "",
    depthAndLighting: parsed.depthAndLighting?.trim() || "",
    topBanner: normalizeReferenceZone(parsed.topBanner),
    headline: normalizeReferenceZone(parsed.headline),
    subheadline: normalizeReferenceZone(parsed.subheadline),
    bottomBanner: normalizeReferenceZone(parsed.bottomBanner),
    callouts: (parsed.callouts ?? []).map((callout) => ({
      placement: callout.placement?.trim() || "",
      style: callout.style?.trim() || "",
      sourceText: callout.sourceText?.trim() || "",
      iconHint: callout.iconHint?.trim() || "",
    })),
  };
}

export async function generateRemakePosterCopy(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  referenceLayout: ReferenceLayoutAnalysis;
}): Promise<ReferencePosterCopy> {
  const ai = createClient(input);
  const calloutCount = input.referenceLayout.callouts.length;
  const category = normalizePromptCategory(input.category);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      "You are rewriting copy for an e-commerce poster remake.",
      [
        `Output language: ${input.language}`,
        `Market: ${input.country}`,
        `Platform: ${input.platform}`,
        category ? `Category: ${category}` : null,
      ]
        .filter(Boolean)
        .join(". ") + ".",
      buildSimplifiedChineseOnlyLine(input.language),
      "You must preserve the reference poster's text hierarchy and slot count instead of inventing a new ad structure.",
      `Reference poster summary: ${input.referenceLayout.summary}.`,
      buildReferenceZoneLine("Top banner", input.referenceLayout.topBanner),
      buildReferenceZoneLine("Headline", input.referenceLayout.headline),
      buildReferenceZoneLine("Subheadline", input.referenceLayout.subheadline),
      buildReferenceZoneLine("Bottom banner", input.referenceLayout.bottomBanner),
      `Callout count to preserve: ${calloutCount}.`,
      input.referenceLayout.callouts.some((item) => item.sourceText?.trim())
        ? `Existing callout texts: ${input.referenceLayout.callouts
            .map((item) => item.sourceText?.trim())
            .filter(Boolean)
            .join(" | ")}.`
        : null,
      buildPromptFactLine([
        ["Product name", input.productName],
        ["Brand", input.brandName],
      ]),
      buildPromptFactLine([["Selling points", input.sellingPoints]]),
      buildPromptFactLine([["Additional notes", input.sourceDescription]]),
      buildRestrictionsLine(input.restrictions),
      "Rules:",
      "- Keep copy concise and suited for a poster, not for a product description page.",
      "- Preserve the number of visible slots from the reference poster whenever possible.",
      "- If a text zone is absent in the reference, return an empty string for that field.",
      "- If there are no callout badges, return an empty array.",
      "- Do not invent pricing, medical claims, certifications, or unsupported slogans.",
      "Return JSON only.",
    ]
      .filter(Boolean)
      .join("\n"),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: referencePosterCopySchema,
      temperature: 0.4,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as Partial<ReferencePosterCopy>;
  const maxCallouts = input.referenceLayout.callouts.length;
  return {
    summary: parsed.summary?.trim() || "",
    topBanner: input.referenceLayout.topBanner.present ? parsed.topBanner?.trim() || "" : "",
    headline: input.referenceLayout.headline.present ? parsed.headline?.trim() || "" : "",
    subheadline: input.referenceLayout.subheadline.present ? parsed.subheadline?.trim() || "" : "",
    bottomBanner: input.referenceLayout.bottomBanner.present ? parsed.bottomBanner?.trim() || "" : "",
    callouts: (parsed.callouts ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, maxCallouts),
  };
}

export async function generateEditedImage(input: {
  apiKey: string;
  imageModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  creationMode?: "standard" | "reference-remix" | "prompt" | "suite" | "amazon-a-plus";
  wrapPromptModeText?: boolean;
  variantsPerType?: number;
  customPromptText?: string;
  customNegativePrompt?: string;
  remakePromptVariant?: "strict" | "fallback";
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  productName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  brandProfile?: BrandRecord | null;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  copy: GeneratedCopyBundle;
  referenceLayout?: ReferenceLayoutAnalysis | null;
  referencePosterCopy?: ReferencePosterCopy | null;
  template?: TemplateRecord | null;
  sourceImages: Array<{ mimeType: string; buffer: Buffer }>;
  referenceImages?: Array<{ mimeType: string; buffer: Buffer }>;
}) {
  const ai = createClient(input);
  const imageConfig: Record<string, string> = {
    aspectRatio: input.ratio,
  };

  if (isGemini3ImageModel(input.imageModel)) {
    imageConfig.imageSize = input.resolutionLabel === "512px" ? "0.5K" : input.resolutionLabel;
  }

  const promptText = resolveImageGenerationPromptText({
    creationMode: input.creationMode,
    customPromptText: input.customPromptText,
    country: input.country,
    language: input.language,
    platform: input.platform,
    category: input.category,
    productName: input.productName,
    brandName: input.brandName,
    brandProfile: input.brandProfile,
    sellingPoints: input.sellingPoints,
    restrictions: input.restrictions,
    sourceDescription: input.sourceDescription,
    materialInfo: input.materialInfo,
    sizeInfo: input.sizeInfo,
    imageType: input.imageType,
    ratio: input.ratio,
    resolutionLabel: input.resolutionLabel,
    copy: input.copy,
    sourceImageCount: input.sourceImages.length,
  });

  const preparedImages = await Promise.all(
    [...input.sourceImages, ...(input.referenceImages ?? [])].map((image) => prepareImageForProvider(image)),
  );
  const maxImagesPerPrompt = getMaxImagesPerPromptForModel(input.imageModel);
  if (preparedImages.length > maxImagesPerPrompt) {
    throw new Error(`The current image model supports up to ${maxImagesPerPrompt} input images per request.`);
  }
  const requestImageCount = preparedImages.length;
  const requestBytes = preparedImages.reduce((total, image) => total + image.buffer.length, 0);

  const withPromptContext = (error: unknown, providerDebug?: ProviderDebugInfo | null) => {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    const enriched = wrapped as Error & { promptText?: string; providerDebug?: ProviderDebugInfo | null };
    enriched.promptText = promptText;
    enriched.providerDebug = providerDebug ?? null;
    return enriched;
  };

  const buildRequestDebug = (failureReason?: string, attempt?: number, maxAttempts?: number) =>
    ({
      retrievalMethod: "inline",
      failureStage: "provider-request",
      failureReason,
      attempt,
      maxAttempts,
      requestImageCount,
      requestBytes,
    }) satisfies ProviderDebugInfo;

  let response;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await ai.models.generateContent({
        model: input.imageModel,
        contents: [
          ...preparedImages.map((image) => ({
            inlineData: {
              mimeType: image.mimeType,
              data: image.buffer.toString("base64"),
            },
          })),
          { text: promptText },
        ],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig,
          temperature: getImageGenerationTemperature(input.creationMode),
        },
      });
      break;
    } catch (error) {
      const failureReason = extractRawErrorMessage(error);
      if (!isRetryableProviderRequestError(error) || attempt === maxAttempts) {
        throw withPromptContext(error, buildRequestDebug(failureReason, attempt, maxAttempts));
      }

      await waitForProviderRetry(attempt);
    }
  }

  if (!response) {
    throw withPromptContext(new Error("Provider request failed without returning a response."), buildRequestDebug(undefined, maxAttempts, maxAttempts));
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((part) => "inlineData" in part && part.inlineData?.data);
  const textPart = parts.find((part) => "text" in part && part.text);
  const textContent = textPart && "text" in textPart ? textPart.text ?? "" : "";

  if (!imagePart || !("inlineData" in imagePart) || !imagePart.inlineData) {
    const imageUrl = extractImageUrlFromText(textContent);

    if (imageUrl) {
      let imageResponse: Response;
      try {
        imageResponse = await fetchImageWithRetries(imageUrl, 3);
      } catch (error) {
        const failureReason = error instanceof Error ? error.message : String(error);
        throw withPromptContext(
          new Error(`Provider returned an image URL, but downloading it failed: ${failureReason}`),
          {
            retrievalMethod: "url",
            imageUrl,
            rawText: textContent || "",
            failureStage: "provider-image-download",
            failureReason,
            requestImageCount,
            requestBytes,
          },
        );
      }

      const mimeType = imageResponse.headers.get("content-type") || mimeTypeFromUrl(imageUrl);
      const buffer = Buffer.from(await imageResponse.arrayBuffer());

      return {
        mimeType,
        buffer,
        notes: textContent,
        promptText,
        providerDebug: {
          retrievalMethod: "url",
          imageUrl,
          rawText: textContent || "",
          requestImageCount,
          requestBytes,
        } satisfies ProviderDebugInfo,
      };
    }

    throw withPromptContext(new Error(textContent || "Gemini did not return an image."), {
      retrievalMethod: "inline",
      rawText: textContent || "",
      failureStage: "response",
      failureReason: textContent || "Gemini did not return an image.",
      requestImageCount,
      requestBytes,
    });
  }

  return {
    mimeType: imagePart.inlineData.mimeType || "image/png",
    buffer: Buffer.from(imagePart.inlineData.data || "", "base64"),
    notes: textContent,
    promptText,
    providerDebug: {
      retrievalMethod: "inline",
      rawText: textContent || "",
      requestImageCount,
      requestBytes,
    } satisfies ProviderDebugInfo,
  };
}

export function resolveImageGenerationPromptText(input: {
  creationMode?: "standard" | "reference-remix" | "prompt" | "suite" | "amazon-a-plus";
  wrapPromptModeText?: boolean;
  customPromptText?: string;
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  productName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  brandProfile?: BrandRecord | null;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  copy: GeneratedCopyBundle;
  sourceImageCount: number;
}) {
  if (input.wrapPromptModeText || input.creationMode === "prompt") {
    return buildPromptModePrompt({
      country: input.country,
      language: input.language,
      platform: input.platform,
      category: input.category,
      productName: input.productName,
      brandName: input.brandName,
      brandProfile: input.brandProfile,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
      materialInfo: input.materialInfo,
      sizeInfo: input.sizeInfo,
      imageType: input.imageType,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      customPrompt: input.customPromptText?.trim() || input.copy.optimizedPrompt,
      hasSourceImages: input.sourceImageCount > 0,
    });
  }

  return input.customPromptText ? input.customPromptText : input.copy.optimizedPrompt;
}

export function buildRemakeCopyBundle(copy: ReferencePosterCopy): GeneratedCopyBundle {
  return {
    optimizedPrompt: copy.summary || copy.headline || copy.subheadline || "",
    title: copy.headline || "",
    subtitle: copy.subheadline || "",
    highlights: (copy.callouts || []).filter((item): item is string => Boolean(item?.trim?.())),
    detailAngles: [],
    painPoints: [],
    cta: copy.bottomBanner || "",
    posterHeadline: copy.headline || "",
    posterSubline: copy.subheadline || "",
  };
}

type WorkflowMode = "standard" | "suite" | "amazon-a-plus" | "reference-remix";

const REFERENCE_REMIX_STAGE1_ANALYSIS_TEMPERATURE = 0.1;
const REFERENCE_REMIX_STAGE2_PROMPT_TEMPERATURE = 0.2;
const DEFAULT_IMAGE_GENERATION_TEMPERATURE = 0.7;
const REFERENCE_REMIX_IMAGE_GENERATION_TEMPERATURE = 0.6;

export function getSharedModeAnalysisTemperature(mode: WorkflowMode) {
  if (mode === "suite") {
    return 0.25;
  }
  if (mode === "reference-remix") {
    return REFERENCE_REMIX_STAGE1_ANALYSIS_TEMPERATURE;
  }
  return 0.2;
}

export function getModeWorkflowCopyTemperature(mode: WorkflowMode) {
  if (mode === "suite") {
    return 0.35;
  }
  if (mode === "reference-remix") {
    return REFERENCE_REMIX_STAGE2_PROMPT_TEMPERATURE;
  }
  return 0.32;
}

export function getImageGenerationTemperature(
  creationMode?: "standard" | "reference-remix" | "prompt" | "suite" | "amazon-a-plus",
) {
  return creationMode === "reference-remix"
    ? REFERENCE_REMIX_IMAGE_GENERATION_TEMPERATURE
    : DEFAULT_IMAGE_GENERATION_TEMPERATURE;
}

interface SharedWorkflowAnalysis {
  mode: WorkflowMode;
  summary: string;
  productIdentity: string;
  visualPriority: string;
  materialAndStructure: string;
  audience: string;
  platformTone: string;
  usageScenarios: string[];
  typeHints: string[];
  negativeConstraints: string[];
  workflowWarning: string;
  referenceSummary?: string;
  referenceLayoutNotes?: string;
  taskType?: string;
  sharedJson?: Record<string, unknown> | null;
}

interface WorkflowTypePlan {
  optimizedPrompt: string;
  negativePrompt: string;
  workflowWarning?: string;
}

interface ReferenceRemixSourceSubjectAnalysis {
  preserved_source_fields: string[];
  source_subject_summary?: string;
}

interface ReferenceRemixImageAnalysis {
  reference_type_classification: string;
  core_replication_dimensions: string[];
  reference_summary?: string;
}

interface ReferenceRemixReplicationStrategy {
  cannot_copy_directly: string[];
  adaptation_notes: string[];
  conflict_resolution: string[];
}

interface ReferenceRemixOutputPlan {
  final_prompt_language?: string;
  final_negative_language?: string;
  layered_execution_order?: string[];
}

interface ReferenceRemixSharedAnalysis {
  task_type?: string;
  source_subject_analysis: ReferenceRemixSourceSubjectAnalysis;
  reference_image_analysis: ReferenceRemixImageAnalysis;
  replication_strategy: ReferenceRemixReplicationStrategy;
  output_plan: ReferenceRemixOutputPlan;
}

interface StandardModeAnalysis {
  mode?: string;
  image_type?: string;
  subject_analysis?: {
    category?: string;
    name?: string;
    main_subject?: string;
    material?: string[];
    color?: string[];
    structure_features?: string[];
    appearance_features?: string[];
    must_keep?: string[];
  };
  reference_analysis?: {
    has_reference?: boolean;
    reference_role?: string;
    composition?: string;
    scene?: string;
    background?: string;
    lighting?: string;
    color_tone?: string;
    mood?: string;
  };
  visual_plan?: {
    goal?: string;
    style?: string;
    scene_description?: string;
    background_plan?: string;
    composition?: string;
    camera_angle?: string;
    shot_size?: string;
    lighting?: string;
    focus_details?: string[];
    copy_space?: string;
    output_ratio?: string;
  };
  prompt_constraints?: {
    must_keep?: string[];
    negative_keywords?: string[];
  };
}

interface SetModeAnalysis {
  mode?: string;
  subject_analysis?: {
    category?: string;
    name?: string;
    main_subject?: string;
    material?: string[];
    color?: string[];
    structure_features?: string[];
    appearance_features?: string[];
    core_selling_points?: string[];
    usage_scenarios?: string[];
    must_keep?: string[];
  };
  set_plan?: {
    set_type?: string;
    image_sequence?: string[];
    global_style?: string;
    global_color_tone?: string;
    global_brand_feel?: string;
  };
}

interface AmazonModeAnalysis {
  mode?: string;
  product_analysis?: {
    category?: string;
    name?: string;
    main_subject?: string;
    material?: string[];
    color?: string[];
    structure_features?: string[];
    appearance_features?: string[];
    core_selling_points?: string[];
    usage_scenarios?: string[];
    size_parameters?: string[];
    brand_expression?: string;
    cultural_value?: string;
    must_keep?: string[];
  };
  amazon_plan?: {
    module_sequence?: string[];
    global_style?: string;
    global_brand_feel?: string;
    global_color_tone?: string;
  };
}

interface FinalPromptConversionJson {
  final_prompt?: string;
  negative_constraints?: string[];
}

interface SetPerImagePlan {
  image_type: string;
  image_goal: string;
  focus_points: string[];
  scene_description: string;
  background_plan: string;
  composition: string;
  camera_angle: string;
  shot_size: string;
  lighting: string;
  copy_space: string;
  output_ratio: string;
}

interface AmazonModulePlan {
  module_name: string;
  module_goal: string;
  focus_points: string[];
  scene_description: string;
  background_plan: string;
  composition: string;
  camera_angle: string;
  lighting: string;
  copy_space: string;
  information_density: string;
  output_ratio: string;
}

const standardModeAnalysisSchema = {
  type: "object",
  required: ["mode", "image_type", "subject_analysis", "reference_analysis", "visual_plan", "prompt_constraints"],
  properties: {
    mode: { type: "string" },
    image_type: { type: "string" },
    subject_analysis: {
      type: "object",
      properties: {
        category: { type: "string" },
        name: { type: "string" },
        main_subject: { type: "string" },
        material: { type: "array", items: { type: "string" } },
        color: { type: "array", items: { type: "string" } },
        structure_features: { type: "array", items: { type: "string" } },
        appearance_features: { type: "array", items: { type: "string" } },
        must_keep: { type: "array", items: { type: "string" } },
      },
    },
    reference_analysis: {
      type: "object",
      properties: {
        has_reference: { type: "boolean" },
        reference_role: { type: "string" },
        composition: { type: "string" },
        scene: { type: "string" },
        background: { type: "string" },
        lighting: { type: "string" },
        color_tone: { type: "string" },
        mood: { type: "string" },
      },
    },
    visual_plan: {
      type: "object",
      properties: {
        goal: { type: "string" },
        style: { type: "string" },
        scene_description: { type: "string" },
        background_plan: { type: "string" },
        composition: { type: "string" },
        camera_angle: { type: "string" },
        shot_size: { type: "string" },
        lighting: { type: "string" },
        focus_details: { type: "array", items: { type: "string" } },
        copy_space: { type: "string" },
        output_ratio: { type: "string" },
      },
    },
    prompt_constraints: {
      type: "object",
      properties: {
        must_keep: { type: "array", items: { type: "string" } },
        negative_keywords: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

const suiteSharedAnalysisSchema = {
  type: "object",
  required: ["mode", "subject_analysis", "set_plan"],
  properties: {
    mode: { type: "string" },
    subject_analysis: {
      type: "object",
      properties: {
        category: { type: "string" },
        name: { type: "string" },
        main_subject: { type: "string" },
        material: { type: "array", items: { type: "string" } },
        color: { type: "array", items: { type: "string" } },
        structure_features: { type: "array", items: { type: "string" } },
        appearance_features: { type: "array", items: { type: "string" } },
        core_selling_points: { type: "array", items: { type: "string" } },
        usage_scenarios: { type: "array", items: { type: "string" } },
        must_keep: { type: "array", items: { type: "string" } },
      },
    },
    set_plan: {
      type: "object",
      properties: {
        set_type: { type: "string" },
        image_sequence: { type: "array", items: { type: "string" } },
        global_style: { type: "string" },
        global_color_tone: { type: "string" },
        global_brand_feel: { type: "string" },
      },
    },
  },
} as const;

const amazonAPlusSharedAnalysisSchema = {
  type: "object",
  required: ["mode", "product_analysis", "amazon_plan"],
  properties: {
    mode: { type: "string" },
    product_analysis: {
      type: "object",
      properties: {
        category: { type: "string" },
        name: { type: "string" },
        main_subject: { type: "string" },
        material: { type: "array", items: { type: "string" } },
        color: { type: "array", items: { type: "string" } },
        structure_features: { type: "array", items: { type: "string" } },
        appearance_features: { type: "array", items: { type: "string" } },
        core_selling_points: { type: "array", items: { type: "string" } },
        usage_scenarios: { type: "array", items: { type: "string" } },
        size_parameters: { type: "array", items: { type: "string" } },
        brand_expression: { type: "string" },
        cultural_value: { type: "string" },
        must_keep: { type: "array", items: { type: "string" } },
      },
    },
    amazon_plan: {
      type: "object",
      properties: {
        module_sequence: { type: "array", items: { type: "string" } },
        global_style: { type: "string" },
        global_brand_feel: { type: "string" },
        global_color_tone: { type: "string" },
      },
    },
  },
} as const;

const finalPromptConversionSchema = {
  type: "object",
  required: ["final_prompt", "negative_constraints"],
  properties: {
    final_prompt: { type: "string" },
    negative_constraints: { type: "array", items: { type: "string" } },
  },
} as const;

const SUITE_PER_IMAGE_PLANNING_LABEL = "suite per-image planning json";
const SUITE_PER_IMAGE_PROMPT_CONVERSION_LABEL = "suite per-image prompt conversion json";
const AMAZON_PER_MODULE_PLANNING_LABEL = "amazon per-module planning json";
const AMAZON_PER_MODULE_PROMPT_CONVERSION_LABEL = "amazon per-module prompt conversion json";

const setImageBlueprints: Record<ImageType, Omit<SetPerImagePlan, "image_type" | "output_ratio">> = {
  "main-image": {
    image_goal: "主图",
    focus_points: ["主体突出", "商业第一视觉", "轮廓清晰"],
    scene_description: "简洁克制的商业主图场景",
    background_plan: "干净背景，弱干扰",
    composition: "稳定主视觉构图",
    camera_angle: "轻微英雄视角或平视",
    shot_size: "中景或偏近景",
    lighting: "明亮商业棚拍光感",
    copy_space: "少量留白",
  },
  lifestyle: {
    image_goal: "生活方式图",
    focus_points: ["生活代入感", "使用情境", "主体仍清晰可见"],
    scene_description: "自然生活方式场景",
    background_plan: "真实生活背景",
    composition: "主体与环境平衡",
    camera_angle: "自然平视",
    shot_size: "中景",
    lighting: "柔和自然光",
    copy_space: "中等留白",
  },
  "feature-overview": {
    image_goal: "卖点总览图",
    focus_points: ["3-5个核心卖点", "主体完整", "适合卖点标注"],
    scene_description: "信息型商品展示场景",
    background_plan: "简洁背景并适合叠加说明",
    composition: "信息感强的结构化构图",
    camera_angle: "稳定平视",
    shot_size: "中景",
    lighting: "均匀商业光",
    copy_space: "较大留白",
  },
  scene: {
    image_goal: "场景图",
    focus_points: ["功能使用环境", "使用逻辑明确", "真实感"],
    scene_description: "与商品用途强相关的真实场景",
    background_plan: "功能环境背景",
    composition: "主体与使用环境协同",
    camera_angle: "符合使用视角",
    shot_size: "中景或大全景",
    lighting: "符合场景的自然/商业混合光",
    copy_space: "中等留白",
  },
  "material-craft": {
    image_goal: "材质工艺图",
    focus_points: ["材质纹理", "做工细节", "品质感"],
    scene_description: "细节放大展示场景",
    background_plan: "简洁衬底背景",
    composition: "局部特写或微距重点构图",
    camera_angle: "微距或近距离观察角度",
    shot_size: "近景/特写",
    lighting: "强调质感的侧光或掠射光",
    copy_space: "少量留白",
  },
  "size-spec": {
    image_goal: "尺寸参数图",
    focus_points: ["比例准确", "参数标注空间", "轮廓完整"],
    scene_description: "参数说明型商品图",
    background_plan: "纯净技术说明背景",
    composition: "主体完整且利于尺寸标注",
    camera_angle: "标准平视",
    shot_size: "完整中景",
    lighting: "均匀理性光线",
    copy_space: "较大留白",
  },
  "white-background": {
    image_goal: "白底图",
    focus_points: ["主体边缘清晰", "背景纯净", "平台适配"],
    scene_description: "纯白背景商品展示",
    background_plan: "纯白或近纯白背景",
    composition: "主体居中或稳定构图",
    camera_angle: "标准商品视角",
    shot_size: "完整中景",
    lighting: "均匀高键光",
    copy_space: "少量留白",
  },
  model: {
    image_goal: "模特图",
    focus_points: ["主体与人物关系", "穿戴/使用效果", "自然感"],
    scene_description: "人物使用商品的真实场景",
    background_plan: "简洁或生活化背景",
    composition: "人物和主体关系清晰",
    camera_angle: "自然人像视角",
    shot_size: "中景",
    lighting: "柔和自然光",
    copy_space: "中等留白",
  },
  poster: {
    image_goal: "海报图",
    focus_points: ["广告感", "冲击力", "品牌视觉"],
    scene_description: "广告海报式场景",
    background_plan: "可承载品牌情绪的海报背景",
    composition: "强主视觉构图",
    camera_angle: "戏剧化但可信的商业视角",
    shot_size: "中景",
    lighting: "强调情绪的商业布光",
    copy_space: "较大留白",
  },
  detail: {
    image_goal: "细节图",
    focus_points: ["结构亮点", "工艺细节", "精度证明"],
    scene_description: "细节证明型场景",
    background_plan: "弱干扰背景",
    composition: "特写重点构图",
    camera_angle: "近距离细节视角",
    shot_size: "近景/特写",
    lighting: "强调细节的质感光",
    copy_space: "少量留白",
  },
  "pain-point": {
    image_goal: "痛点图",
    focus_points: ["问题场景", "解决逻辑", "对比感"],
    scene_description: "问题与解决方案的说明场景",
    background_plan: "能体现问题语境的场景背景",
    composition: "问题-解决导向构图",
    camera_angle: "说明型视角",
    shot_size: "中景",
    lighting: "清晰说明光线",
    copy_space: "中等留白",
  },
  "multi-scene": {
    image_goal: "多场景图",
    focus_points: ["多环境适配", "统一风格", "使用广度"],
    scene_description: "多场景应用展示",
    background_plan: "多个场景片段组合",
    composition: "分区组合构图",
    camera_angle: "多视角组合",
    shot_size: "中景",
    lighting: "统一风格光线",
    copy_space: "中等留白",
  },
  "culture-value": {
    image_goal: "文化价值图",
    focus_points: ["品牌故事感", "礼赠属性", "情绪价值"],
    scene_description: "具有情绪和文化表达的场景",
    background_plan: "审美化背景",
    composition: "叙事感构图",
    camera_angle: "审美表达视角",
    shot_size: "中景",
    lighting: "柔和氛围光",
    copy_space: "中等留白",
  },
};

const amazonModuleBlueprints: Partial<Record<ImageType, Omit<AmazonModulePlan, "module_name" | "output_ratio">>> = {
  poster: {
    module_goal: "海报图",
    focus_points: ["品牌感", "第一视觉", "广告冲击力"],
    scene_description: "适合亚马逊首屏吸引的海报型场景",
    background_plan: "品牌化、广告化背景",
    composition: "主视觉强冲击构图",
    camera_angle: "广告级商业视角",
    lighting: "强调层次与品牌感的商业布光",
    copy_space: "较大留白",
    information_density: "中",
  },
  "feature-overview": {
    module_goal: "卖点总览",
    focus_points: ["3-5个核心卖点", "主体完整", "信息清晰"],
    scene_description: "适合卖点总览的模块化展示",
    background_plan: "简洁说明背景",
    composition: "信息模块化构图",
    camera_angle: "稳定平视",
    lighting: "均匀商业光",
    copy_space: "大留白",
    information_density: "高",
  },
  "multi-scene": {
    module_goal: "多场景应用",
    focus_points: ["多场景适配", "用途广", "统一风格"],
    scene_description: "多个真实使用场景组合",
    background_plan: "场景分区背景",
    composition: "多模块组合构图",
    camera_angle: "多视角混合",
    lighting: "统一氛围光线",
    copy_space: "中等留白",
    information_density: "中",
  },
  detail: {
    module_goal: "细节图",
    focus_points: ["材质纹理", "工艺细节", "结构亮点"],
    scene_description: "细节证明型模块",
    background_plan: "干净细节衬底",
    composition: "近景特写构图",
    camera_angle: "微距/近距视角",
    lighting: "强调材质的细节光",
    copy_space: "少量留白",
    information_density: "低",
  },
  "size-spec": {
    module_goal: "尺寸参数",
    focus_points: ["比例准确", "参数标注空间", "规范表达"],
    scene_description: "技术参数模块",
    background_plan: "理性说明背景",
    composition: "完整轮廓构图",
    camera_angle: "标准平视",
    lighting: "均匀说明光",
    copy_space: "大留白",
    information_density: "高",
  },
  "culture-value": {
    module_goal: "文化价值",
    focus_points: ["品牌故事", "礼赠属性", "情绪价值"],
    scene_description: "带文化和情绪价值的审美场景",
    background_plan: "审美化或礼赠化背景",
    composition: "叙事型模块构图",
    camera_angle: "审美表达视角",
    lighting: "柔和氛围光",
    copy_space: "中等留白",
    information_density: "中",
  },
};

const referenceRemixAnalysisSchema = {
  type: "object",
  required: ["mode", "task_type", "source_subject_analysis", "reference_image_analysis", "replication_strategy", "output_plan"],
  properties: {
    mode: { type: "string" },
    task_type: { type: "string" },
    source_subject_analysis: {
      type: "object",
      required: ["preserved_source_fields"],
      properties: {
        preserved_source_fields: { type: "array", items: { type: "string" } },
        source_subject_summary: { type: "string" },
      },
    },
    reference_image_analysis: {
      type: "object",
      required: ["reference_type_classification", "core_replication_dimensions"],
      properties: {
        reference_type_classification: { type: "string" },
        core_replication_dimensions: { type: "array", items: { type: "string" } },
        reference_summary: { type: "string" },
      },
    },
    replication_strategy: {
      type: "object",
      required: ["cannot_copy_directly", "adaptation_notes", "conflict_resolution"],
      properties: {
        cannot_copy_directly: { type: "array", items: { type: "string" } },
        adaptation_notes: { type: "array", items: { type: "string" } },
        conflict_resolution: { type: "array", items: { type: "string" } },
      },
    },
    output_plan: {
      type: "object",
      properties: {
        final_prompt_language: { type: "string" },
        final_negative_language: { type: "string" },
        layered_execution_order: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;

const referenceRemixPromptSchema = {
  type: "object",
  required: ["optimizedPrompt", "negativePrompt", "task_type"],
  properties: {
    optimizedPrompt: { type: "string" },
    negativePrompt: { type: "string" },
    task_type: { type: "string" },
    workflowWarning: { type: "string" },
  },
} as const;

function workflowModeLabel(mode: WorkflowMode) {
  if (mode === "reference-remix") return "reference remix";
  if (mode === "amazon-a-plus") return "Amazon A+";
  if (mode === "suite") return "suite";
  return "standard";
}

const setImageRuleBlueprints: Record<ImageType, { goal: string; rules: string }> = {
  "main-image": {
    goal: "Main image. Emphasize a dominant subject, a refined background, commercial click-through clarity, and believable product photography.",
    rules: "Keep the product centered or visually stable. Preserve real color, shape, scale, and hero clarity. Background must stay clean and premium.",
  },
  lifestyle: {
    goal: "Lifestyle image. Place the product into a natural, real, emotionally warm daily-life context while keeping the product as the visual center.",
    rules: "Show believable lifestyle use, natural atmosphere, and smooth subject-scene integration. Do not let the scene overpower the product.",
  },
  "feature-overview": {
    goal: "Feature overview image. Summarize 3 to 5 key benefits in one efficient overview frame with structured annotation space.",
    rules: "Keep the full product clear. Reserve clean zones for later callouts. The frame should feel informative, ordered, and professional.",
  },
  scene: {
    goal: "Scene image. Explain function, spatial relationship, and real usage value through a believable use environment.",
    rules: "Use a realistic scene that supports the product function. Keep the product readable and avoid letting the environment bury it.",
  },
  "material-craft": {
    goal: "Material and craft image. Highlight texture, touch, finish, craftsmanship, and close-up quality proof.",
    rules: "Use close-up or macro logic when useful. Lighting should reveal texture, finish, stitching, joins, or process details with premium credibility.",
  },
  "size-spec": {
    goal: "Size spec image. Keep the full contour clear, proportionally accurate, annotation-friendly, and suitable for dimension overlays.",
    rules: "Choose an angle that supports measurement lines, labels, and parameter comparison. Keep the background clean and technical.",
  },
  "white-background": {
    goal: "White-background image. Keep the product silhouette exact on a clean neutral background.",
    rules: "No clutter, no exaggerated props, and no visual distortion.",
  },
  model: {
    goal: "Model image. Present the product in believable human use while keeping the product readable.",
    rules: "The product remains the visual hero, with realistic styling and natural proportions.",
  },
  poster: {
    goal: "Poster image. Keep a hero-led advertising composition with clean promotional hierarchy.",
    rules: "Use campaign-level impact without turning the product into a fantasy render.",
  },
  detail: {
    goal: "Detail image. Highlight precision, texture, and craftsmanship.",
    rules: "Use close-up framing that proves material truth and build quality.",
  },
  "pain-point": {
    goal: "Pain-point image. Show a clear problem-solution narrative.",
    rules: "Explain the problem visually, then resolve it with the product.",
  },
  "multi-scene": {
    goal: "Multi-scene image. Show multiple believable use cases while preserving product truth.",
    rules: "Keep all scenes consistent in tone and product identity.",
  },
  "culture-value": {
    goal: "Culture-value image. Express taste, gifting, and emotional value around the product.",
    rules: "Use editorial storytelling and restrained atmosphere rather than literal clichés.",
  },
};

const amazonModuleRuleBlueprints: Partial<
  Record<ImageType, { goal: string; rules: string; requiredField: string; fieldInstruction: string }>
> = {
  poster: {
    goal: "Poster. Build a strong hero visual with brand-ad quality, obvious copy-safe zones, and banner-style impact.",
    rules: "Keep the product dominant, premium, and campaign-ready.",
    requiredField: "poster_plan",
    fieldInstruction: "poster_plan must summarize the hero visual, copy-safe zone, and banner-level composition intent.",
  },
  "feature-overview": {
    goal: "Feature overview. Summarize 3 to 5 core selling points with a clear annotation zone and structured density.",
    rules: "Keep the frame informative, ordered, and suitable for A+ annotation overlays.",
    requiredField: "selling_point_summary",
    fieldInstruction: "selling_point_summary must summarize the strongest selling points and the annotation strategy.",
  },
  "multi-scene": {
    goal: "Multi-scene. Show 2 to 4 real use environments with consistent product truth and unified visual style.",
    rules: "Separate scenes clearly while keeping them coherent as one A+ module.",
    requiredField: "multi_scene_plan",
    fieldInstruction: "multi_scene_plan must describe the scene count, scene contrast, and visual linking logic.",
  },
  detail: {
    goal: "Detail. Focus on the material, structure, and craftsmanship details most worth zooming in on.",
    rules: "Use close-up or macro logic and keep the detail proof believable.",
    requiredField: "detail_focus_plan",
    fieldInstruction: "detail_focus_plan must describe the detail target, crop logic, and craftsmanship proof angle.",
  },
  "size-spec": {
    goal: "Size spec. Keep the full contour readable, proportionally credible, and annotation-friendly for dimension overlays.",
    rules: "Choose an angle that supports measurement labels and parameter comparison.",
    requiredField: "size_parameter_plan",
    fieldInstruction: "size_parameter_plan must describe the outline angle, label-safe area, and parameter emphasis.",
  },
  "culture-value": {
    goal: "Culture value. Express emotional resonance, gifting value, or lifestyle symbolism tied to the product.",
    rules: "Use tasteful storytelling and mood without losing product clarity.",
    requiredField: "cultural_value_plan",
    fieldInstruction: "cultural_value_plan must describe the emotional story, cultural cue, or gifting value expression.",
  },
};

function parseWorkflowJson<T extends object = Record<string, unknown>>(raw?: string): T {
  const cleaned = (raw ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned || "{}") as T;
}

function trimWorkflowString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isJsonLikePromptText(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return false;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "object" && parsed !== null;
  } catch {
    return false;
  }
}

export function sanitizeWorkflowOptimizedPrompt(candidatePrompt: string, fallbackPrompt: string) {
  const normalizedCandidate = candidatePrompt.trim();
  const normalizedFallback = fallbackPrompt.trim();

  if (!normalizedCandidate) {
    return normalizedFallback;
  }

  if (isJsonLikePromptText(normalizedCandidate)) {
    return normalizedFallback || normalizedCandidate;
  }

  return normalizedCandidate;
}

function trimWorkflowStringList(value: unknown, limit = 5) {
  return Array.isArray(value)
    ? value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
        .slice(0, limit)
    : [];
}

function hasWorkflowValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => hasWorkflowValue(entry));
  }
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function defaultWorkflowNegativePrompt(language: string, mode: WorkflowMode) {
  if (mode === "reference-remix") {
    return "禁止直接照抄参考图文字、Logo、水印或版权图形，避免主体错误、材质错误、结构错误、比例失真、构图混乱、光影失真、背景脏乱、低清晰度、模糊、伪影、重复元素。";
  }

  const normalizedLanguage = language.trim().toLowerCase();
  return normalizedLanguage.startsWith("zh")
    ? "低清晰度、模糊、商品变形、结构错误、比例失真、材质错误、边缘粘连、背景杂乱、主体不突出、透视错误、光影不自然、过曝、欠曝、噪点、伪影、重复元素、不真实反射、文字乱码、细节丢失。"
    : "low resolution, blur, product deformation, structural errors, distorted proportions, wrong materials, merged edges, cluttered background, weak subject focus, perspective errors, unnatural lighting, overexposure, underexposure, noise, artifacts, repeated elements, unrealistic reflections, garbled text, missing details.";
}

function workflowFallbackLabel(mode: WorkflowMode) {
  return mode === "suite" ? "Suite" : mode === "amazon-a-plus" ? "Amazon A+" : "Reference remix";
}

function workflowFallbackPrefix(mode: WorkflowMode) {
  return mode === "suite"
    ? "Suite workflow fallback:"
    : mode === "amazon-a-plus"
      ? "Amazon A+ workflow fallback:"
      : "Reference remix workflow fallback:";
}

interface ReferenceRemixPromptInputs {
  brandName: string;
  category: string;
  productName?: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
}

interface ReferenceRemixStage2PromptInputs extends Omit<ReferenceRemixPromptInputs, "materialInfo" | "sizeInfo"> {
  analysisJson: Record<string, unknown>;
  taskType?: string;
  ratio: string;
  resolutionLabel: string;
}

function buildReferenceRemixReferenceFirstPrinciples() {
  return [
    "Reference image is the primary blueprint for composition, shot distance, pose/action, clothing silhouette/color blocking, background structure, prop relationships, lighting, and mood.",
    "Use the source image only for identity truth.",
    "If the source image is headshot or half-body while the reference is full-body, still reconstruct the full-body composition from the reference.",
    "Do not collapse back into a source-like portrait framing when the reference calls for a wider body coverage.",
  ];
}

export function buildReferenceRemixStage1AnalysisPrompt(input: ReferenceRemixPromptInputs) {
  return [
    "reference remix source/reference analysis json",
    "Return JSON only.",
    "Top-level JSON keys must be exactly: mode, task_type, source_subject_analysis, reference_image_analysis, replication_strategy, output_plan.",
    "mode must be reference-remix.",
    "task_type must classify the remix intent.",
    "source_subject_analysis must include preserved_source_fields.",
    "reference_image_analysis must include reference_type_classification and core_replication_dimensions.",
    "replication_strategy must include cannot_copy_directly, adaptation_notes, conflict_resolution.",
    "The final prompt must be Chinese.",
    "The negativePrompt must be Chinese.",
    "Use image 1 as the source subject image and image 2 as the reference image.",
    ...buildReferenceRemixReferenceFirstPrinciples(),
    "Do not directly copy reference image text, logo, watermark, or copyrighted graphics.",
    `Brand: ${input.brandName}. Category: ${input.category}.`,
    `Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
    `Additional notes: ${input.sourceDescription}.`,
    input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
    input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReferenceRemixStage2PromptConversionPrompt(input: ReferenceRemixStage2PromptInputs) {
  return [
    "reference remix chinese prompt conversion",
    "Return JSON only.",
    "Use the reference remix analysis JSON to produce one final Chinese natural-language prompt and one Chinese negativePrompt.",
    "The final prompt must be Chinese.",
    "The negativePrompt must be Chinese.",
    "Reference-first execution is mandatory.",
    ...buildReferenceRemixReferenceFirstPrinciples(),
    "For headshot/half-body source with full-body reference, reconstruct the full-body composition from the reference rather than collapsing into a portrait.",
    "The final Chinese optimizedPrompt must explicitly cover: subject integrity, composition and camera distance, lighting and color tone, scene and background structure, props and object relationships, mood and narrative, whitespace/layout, and output requirements.",
    "Do not directly copy the reference image text, logo, watermark, or copyrighted graphics.",
    `Reference remix analysis JSON: ${JSON.stringify(input.analysisJson)}.`,
    input.taskType ? `Detected task_type: ${input.taskType}.` : null,
    `Brand: ${input.brandName}. Category: ${input.category}.`,
    `Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
    `Additional notes: ${input.sourceDescription}.`,
    `Aspect ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildReferenceRemixFallbackOptimizedPrompt(input: Pick<ReferenceRemixPromptInputs, "sellingPoints" | "restrictions" | "sourceDescription">) {
  return [
    "Use 1 source image plus 1 reference image for reference remix generation.",
    ...buildReferenceRemixReferenceFirstPrinciples(),
    "Preserve only source identity truth; adapt everything else to match the reference composition and scene logic.",
    "Do not directly copy any text, logo, watermark, or copyrighted graphics from the reference.",
    input.sellingPoints?.trim() ? `Selling points: ${input.sellingPoints.trim()}` : null,
    input.sourceDescription?.trim() ? `Additional notes: ${input.sourceDescription.trim()}` : null,
    input.restrictions?.trim() ? `Restrictions: ${input.restrictions.trim()}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStandardStage1AnalysisPrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType: ImageType;
}) {
  return [
    "standard stage 1 analysis json",
    "Return JSON only.",
    "Top-level JSON keys must be exactly: mode, image_type, subject_analysis, reference_analysis, visual_plan, prompt_constraints.",
    "mode must be standard.",
    "Analyze the uploaded source image and any provided reference image for a single-image e-commerce generation task.",
    `Target image type: ${input.imageType}.`,
    `Market: ${input.country}. Language: ${input.language}. Platform: ${input.platform}. Category: ${input.category}.`,
    `Brand: ${input.brandName}. Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
    `Additional notes: ${input.sourceDescription}.`,
    input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
    input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
    "subject_analysis should identify subject category, name, main_subject, material, color, structure_features, appearance_features, and must_keep.",
    "reference_analysis should describe whether a reference image exists and what it contributes in composition, scene, background, lighting, color tone, and mood.",
    "visual_plan should define goal, style, scene_description, background_plan, composition, camera_angle, shot_size, lighting, focus_details, copy_space, and output_ratio.",
    "prompt_constraints should summarize must_keep constraints and negative_keywords.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildStandardStage2PromptConversionPrompt(input: {
  analysisJson: Record<string, unknown>;
  ratio: string;
  resolutionLabel: string;
  imageType: ImageType;
}) {
  return [
    "standard stage 2 prompt conversion json",
    "Return JSON only with final_prompt and negative_constraints.",
    "Convert the standard analysis JSON into one final plain-text image generation prompt.",
    `Target image type: ${input.imageType}.`,
    `Aspect ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
    `Standard analysis JSON: ${JSON.stringify(input.analysisJson)}.`,
    "The final prompt must read naturally and cover subject definition, must-keep constraints, image goal, scene/background, composition/camera, lighting/color tone, focus details, copy-space needs, and output requirements.",
  ].join("\n");
}

export function buildSetStage1AnalysisPrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
}) {
  return [
    "suite stage 1 set analysis json",
    "Return JSON only.",
    "Top-level JSON keys must be exactly: mode, subject_analysis, set_plan.",
    "mode must be set.",
    "Analyze the uploaded product image for a fixed six-image set workflow.",
    `Market: ${input.country}. Language: ${input.language}. Platform: ${input.platform}. Category: ${input.category}.`,
    `Brand: ${input.brandName}. Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
    `Additional notes: ${input.sourceDescription}.`,
    input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
    input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
    "subject_analysis should identify category, name, main_subject, material, color, structure_features, appearance_features, core_selling_points, usage_scenarios, and must_keep.",
    "set_plan should define set_type, image_sequence, global_style, global_color_tone, and global_brand_feel.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSetPerImagePlan(analysis: SetModeAnalysis, input: { imageType: ImageType; ratio: string }): SetPerImagePlan {
  const blueprint = setImageBlueprints[input.imageType] ?? setImageBlueprints.scene;
  return {
    image_type: input.imageType,
    image_goal: blueprint.image_goal,
    focus_points: blueprint.focus_points,
    scene_description: blueprint.scene_description,
    background_plan: blueprint.background_plan,
    composition: blueprint.composition,
    camera_angle: blueprint.camera_angle,
    shot_size: blueprint.shot_size,
    lighting: blueprint.lighting,
    copy_space: blueprint.copy_space,
    output_ratio: input.ratio || analysis.set_plan?.image_sequence?.[0] || "1:1",
  };
}

export function buildSetPerImagePromptConversionPrompt(input: {
  planningJson: SetPerImagePlan;
  subjectAnalysisJson: Record<string, unknown>;
  ratio: string;
  resolutionLabel: string;
}) {
  return [
    SUITE_PER_IMAGE_PLANNING_LABEL,
    `Planning JSON: ${JSON.stringify(input.planningJson)}.`,
    SUITE_PER_IMAGE_PROMPT_CONVERSION_LABEL,
    "Return JSON only with final_prompt and negative_constraints.",
    `Aspect ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
    `Subject analysis JSON: ${JSON.stringify(input.subjectAnalysisJson)}.`,
    "Convert the suite per-image planning JSON into one final plain-text prompt for the current image only.",
  ].join("\n");
}

export function buildAmazonStage1AnalysisPrompt(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
}) {
  return [
    "amazon stage 1 analysis json",
    "Return JSON only.",
    "Top-level JSON keys must be exactly: mode, product_analysis, amazon_plan.",
    "mode must be amazon.",
    "Analyze the uploaded product image for a fixed six-module Amazon detail/A+ workflow.",
    `Market: ${input.country}. Language: ${input.language}. Platform: ${input.platform}. Category: ${input.category}.`,
    `Brand: ${input.brandName}. Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
    `Additional notes: ${input.sourceDescription}.`,
    input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
    input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
    "product_analysis should identify category, name, main_subject, material, color, structure_features, appearance_features, core_selling_points, usage_scenarios, size_parameters, brand_expression, cultural_value, and must_keep.",
    "amazon_plan should define module_sequence, global_style, global_brand_feel, and global_color_tone.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildAmazonPerModulePlan(analysis: AmazonModeAnalysis, input: { imageType: ImageType; ratio: string }): AmazonModulePlan {
  const blueprint = amazonModuleBlueprints[input.imageType] ?? amazonModuleBlueprints.poster!;
  return {
    module_name: input.imageType,
    module_goal: blueprint.module_goal,
    focus_points: blueprint.focus_points,
    scene_description: blueprint.scene_description,
    background_plan: blueprint.background_plan,
    composition: blueprint.composition,
    camera_angle: blueprint.camera_angle,
    lighting: blueprint.lighting,
    copy_space: blueprint.copy_space,
    information_density: blueprint.information_density,
    output_ratio: input.ratio || analysis.amazon_plan?.module_sequence?.[0] || "1:1",
  };
}

export function buildAmazonPerModulePromptConversionPrompt(input: {
  planningJson: AmazonModulePlan;
  productAnalysisJson: Record<string, unknown>;
  ratio: string;
  resolutionLabel: string;
}) {
  return [
    AMAZON_PER_MODULE_PLANNING_LABEL,
    `Planning JSON: ${JSON.stringify(input.planningJson)}.`,
    AMAZON_PER_MODULE_PROMPT_CONVERSION_LABEL,
    "Return JSON only with final_prompt and negative_constraints.",
    `Aspect ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
    `Product analysis JSON: ${JSON.stringify(input.productAnalysisJson)}.`,
    "Convert the amazon per-module planning JSON into one final plain-text prompt for the current module only.",
  ].join("\n");
}

function buildGeneratedCopyBundleFromPromptConversion(input: {
  mode: WorkflowMode;
  finalPrompt: string;
  negativeConstraints: string[];
  fallbackPrompt: string;
  title: string;
  highlights?: string[];
  workflowWarning?: string;
}) {
  const normalizedPrompt = sanitizeWorkflowOptimizedPrompt(input.finalPrompt, input.fallbackPrompt);
  const normalizedNegativePrompt = input.negativeConstraints.map((item) => item.trim()).filter(Boolean).join(", ");

  return {
    optimizedPrompt: withNegativeConstraints(normalizedPrompt || input.fallbackPrompt, normalizedNegativePrompt, input.mode),
    negativePrompt: normalizedNegativePrompt,
    workflowWarning: input.workflowWarning?.trim() || "",
    title: input.title,
    subtitle: "",
    highlights: input.highlights ?? [],
    detailAngles: [],
    painPoints: [],
    cta: "",
    posterHeadline: input.title,
    posterSubline: "",
  };
}

function buildStandardFallbackOptimizedPrompt(input: {
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  brandName: string;
  category: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
}) {
  return [
    `Generate one ${input.imageType} for an e-commerce listing.`,
    input.brandName ? `Brand: ${input.brandName}.` : null,
    input.category ? `Category: ${input.category}.` : null,
    input.sellingPoints ? `Focus on: ${input.sellingPoints}.` : null,
    input.sourceDescription ? `Additional notes: ${input.sourceDescription}.` : null,
    `Target ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
    input.restrictions ? `Restrictions: ${input.restrictions}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildSetFallbackOptimizedPrompt(input: {
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
}) {
  const plan = buildSetPerImagePlan({ set_plan: {} }, { imageType: input.imageType, ratio: input.ratio });
  return [
    `Generate one set image for ${plan.image_goal}.`,
    `Focus on ${plan.focus_points.join(" / ")}.`,
    `Scene: ${plan.scene_description}. Background: ${plan.background_plan}.`,
    `Composition: ${plan.composition}. Camera: ${plan.camera_angle}. Shot size: ${plan.shot_size}. Lighting: ${plan.lighting}.`,
    input.sellingPoints ? `Selling points: ${input.sellingPoints}.` : null,
    input.sourceDescription ? `Additional notes: ${input.sourceDescription}.` : null,
    input.restrictions ? `Restrictions: ${input.restrictions}.` : null,
    `Target ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildAmazonFallbackOptimizedPrompt(input: {
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
}) {
  const plan = buildAmazonPerModulePlan({ amazon_plan: {} }, { imageType: input.imageType, ratio: input.ratio });
  return [
    `Generate one Amazon module image for ${plan.module_goal}.`,
    `Focus on ${plan.focus_points.join(" / ")}.`,
    `Scene: ${plan.scene_description}. Background: ${plan.background_plan}.`,
    `Composition: ${plan.composition}. Camera: ${plan.camera_angle}. Lighting: ${plan.lighting}.`,
    input.sellingPoints ? `Selling points: ${input.sellingPoints}.` : null,
    input.sourceDescription ? `Additional notes: ${input.sourceDescription}.` : null,
    input.restrictions ? `Restrictions: ${input.restrictions}.` : null,
    `Target ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function withNegativeConstraints(prompt: string, negativePrompt: string, mode: WorkflowMode) {
  const trimmedPrompt = prompt.trim();
  const trimmedNegative = negativePrompt.trim();
  if (!trimmedNegative) {
    return trimmedPrompt;
  }
  return [trimmedPrompt, `${mode === "reference-remix" ? "负向约束：" : "Negative constraints:"} ${trimmedNegative}`]
    .filter(Boolean)
    .join("\n");
}

function createWorkflowBaseCopy(productName: string, baseCopy?: GeneratedCopyBundle | null): GeneratedCopyBundle {
  return (
    baseCopy ?? {
      optimizedPrompt: productName,
      title: productName,
      subtitle: "",
      highlights: [],
      detailAngles: [],
      painPoints: [],
      cta: "",
      posterHeadline: productName,
      posterSubline: "",
    }
  );
}

function buildWorkflowCopyBundle(
  base: GeneratedCopyBundle,
  parsed: Partial<GeneratedCopyBundle> & Partial<WorkflowTypePlan>,
  mode: WorkflowMode,
  negativePrompt: string,
  workflowWarning: string,
): GeneratedCopyBundle {
  const fallbackPrompt = trimWorkflowString(base.optimizedPrompt);
  const optimizedPrompt = sanitizeWorkflowOptimizedPrompt(
    trimWorkflowString(parsed.optimizedPrompt),
    fallbackPrompt,
  );

  return {
    optimizedPrompt: withNegativeConstraints(optimizedPrompt || fallbackPrompt, negativePrompt, mode),
    negativePrompt: negativePrompt.trim() || base.negativePrompt || "",
    workflowWarning: workflowWarning.trim() || base.workflowWarning || "",
    title: trimWorkflowString(parsed.title) || base.title,
    subtitle: trimWorkflowString(parsed.subtitle) || base.subtitle,
    highlights: trimWorkflowStringList(parsed.highlights, 5),
    detailAngles: trimWorkflowStringList(parsed.detailAngles, 4),
    painPoints: trimWorkflowStringList(parsed.painPoints, 4),
    cta: trimWorkflowString(parsed.cta) || base.cta,
    posterHeadline: trimWorkflowString(parsed.posterHeadline) || base.posterHeadline,
    posterSubline: trimWorkflowString(parsed.posterSubline) || base.posterSubline,
  };
}

async function createWorkflowFallbackCopyBundle(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: WorkflowMode;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  template?: TemplateRecord | null;
  reason: string;
}): Promise<GeneratedCopyBundle> {
  const negativePrompt = defaultWorkflowNegativePrompt(input.language, input.mode);
  const workflowWarning = `${workflowFallbackPrefix(input.mode)} ${input.reason}`;

  if (input.mode === "reference-remix") {
    const optimizedPrompt = buildReferenceRemixFallbackOptimizedPrompt({
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
    });

    return {
      optimizedPrompt: withNegativeConstraints(optimizedPrompt, negativePrompt, input.mode),
      negativePrompt,
      workflowWarning,
      title: input.productName || "参考图复刻",
      subtitle: "",
      highlights: [],
      detailAngles: [],
      painPoints: [],
      cta: "",
      posterHeadline: input.productName || "参考图复刻",
      posterSubline: "",
    };
  }
  if (input.mode === "standard") {
    const fallbackPrompt = buildStandardFallbackOptimizedPrompt({
      imageType: input.imageType,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      brandName: input.brandName,
      category: input.category,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
    });
    return buildGeneratedCopyBundleFromPromptConversion({
      mode: input.mode,
      finalPrompt: fallbackPrompt,
      negativeConstraints: negativePrompt ? [negativePrompt] : [],
      fallbackPrompt,
      title: input.productName || input.imageType,
      workflowWarning,
    });
  }

  if (input.mode === "suite") {
    const fallbackPrompt = buildSetFallbackOptimizedPrompt({
      imageType: input.imageType,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
    });
    return buildGeneratedCopyBundleFromPromptConversion({
      mode: input.mode,
      finalPrompt: fallbackPrompt,
      negativeConstraints: negativePrompt ? [negativePrompt] : [],
      fallbackPrompt,
      title: input.productName || input.imageType,
      highlights: setImageBlueprints[input.imageType]?.focus_points ?? [],
      workflowWarning,
    });
  }

  const fallbackPrompt = buildAmazonFallbackOptimizedPrompt({
    imageType: input.imageType,
    ratio: input.ratio,
    resolutionLabel: input.resolutionLabel,
    sellingPoints: input.sellingPoints,
    restrictions: input.restrictions,
    sourceDescription: input.sourceDescription,
  });
  return buildGeneratedCopyBundleFromPromptConversion({
    mode: input.mode,
    finalPrompt: fallbackPrompt,
    negativeConstraints: negativePrompt ? [negativePrompt] : [],
    fallbackPrompt,
    title: input.productName || input.imageType,
    highlights: amazonModuleBlueprints[input.imageType]?.focus_points ?? [],
    workflowWarning,
  });
}

export async function generateSharedModeAnalysis(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: WorkflowMode;
  sourceImage: { mimeType: string; buffer: Buffer };
  referenceImage?: { mimeType: string; buffer: Buffer } | null;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  imageType?: ImageType;
}) {
  const ai = createClient(input);
  const sourceImagePart = {
    inlineData: {
      mimeType: input.sourceImage.mimeType,
      data: input.sourceImage.buffer.toString("base64"),
    },
  };

  if (input.mode === "reference-remix") {
    if (!input.referenceImage) {
      throw new Error("Reference remix shared analysis requires a reference image.");
    }

    const response = await ai.models.generateContent({
      model: input.textModel,
      contents: [
        sourceImagePart,
        {
          inlineData: {
            mimeType: input.referenceImage.mimeType,
            data: input.referenceImage.buffer.toString("base64"),
          },
        },
        {
          text: buildReferenceRemixStage1AnalysisPrompt({
            brandName: input.brandName,
            category: input.category,
            sellingPoints: input.sellingPoints,
            restrictions: input.restrictions,
            sourceDescription: input.sourceDescription,
            materialInfo: input.materialInfo,
            sizeInfo: input.sizeInfo,
          }),
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: referenceRemixAnalysisSchema,
        temperature: getSharedModeAnalysisTemperature(input.mode),
      },
    });

    const parsed = parseWorkflowJson<ReferenceRemixSharedAnalysis>(response.text);

    if (
      !parsed.source_subject_analysis ||
      !parsed.reference_image_analysis ||
      !parsed.replication_strategy ||
      !parsed.output_plan
    ) {
      throw new Error("Reference remix shared analysis JSON is incomplete.");
    }

    const preservedFields = trimWorkflowStringList(parsed.source_subject_analysis.preserved_source_fields, 8);
    const replicationDimensions = trimWorkflowStringList(parsed.reference_image_analysis.core_replication_dimensions, 8);
    const cannotCopyDirectly = trimWorkflowStringList(parsed.replication_strategy.cannot_copy_directly, 8);
    const adaptationNotes = trimWorkflowStringList(parsed.replication_strategy.adaptation_notes, 8);
    const conflictResolution = trimWorkflowStringList(parsed.replication_strategy.conflict_resolution, 8);

    return {
      mode: input.mode,
      summary:
        trimWorkflowString(parsed.reference_image_analysis.reference_summary) ||
        trimWorkflowString(parsed.source_subject_analysis.source_subject_summary) ||
        "reference remix",
      productIdentity: preservedFields.join(", "),
      visualPriority: replicationDimensions.join(", "),
      materialAndStructure: input.materialInfo?.trim() || preservedFields.join(", "),
      audience: "",
      platformTone: "reference remix",
      usageScenarios: trimWorkflowStringList(parsed.output_plan.layered_execution_order, 6),
      typeHints: adaptationNotes,
      negativeConstraints: cannotCopyDirectly.length ? cannotCopyDirectly : [defaultWorkflowNegativePrompt("zh-CN", input.mode)],
      workflowWarning: "",
      referenceSummary: trimWorkflowString(parsed.reference_image_analysis.reference_summary),
      referenceLayoutNotes: [...adaptationNotes, ...conflictResolution].join(" / "),
      taskType: trimWorkflowString(parsed.task_type) || "营销图复刻",
      sharedJson: parsed as unknown as Record<string, unknown>,
    };
  }

  const standardPrompt = [
    "standard stage 1 analysis json",
    "Return JSON only.",
    "Top-level JSON keys must be exactly: mode, image_type, subject_analysis, reference_analysis, visual_plan, prompt_constraints.",
    "mode must be standard.",
    "Analyze the uploaded source image for a single target image generation task.",
    input.referenceImage ? "A reference image is also provided and should influence reference_analysis only." : null,
    `Target image type: ${input.imageType ?? "scene"}.`,
    `Market: ${input.country}. Language: ${input.language}. Platform: ${input.platform}. Category: ${input.category}.`,
    `Brand: ${input.brandName}. Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
    `Additional notes: ${input.sourceDescription}.`,
    input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
    input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
  ];

  const sharedPrompt =
    input.mode === "standard"
      ? standardPrompt
      : input.mode === "suite"
        ? [
            "suite stage 1 set analysis json",
            "Return JSON only.",
            "Top-level JSON keys must be exactly: mode, subject_analysis, set_plan.",
            "mode must be set.",
            "Analyze the uploaded product image for a six-image set workflow.",
            `Market: ${input.country}. Language: ${input.language}. Platform: ${input.platform}. Category: ${input.category}.`,
            `Brand: ${input.brandName}. Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
            `Additional notes: ${input.sourceDescription}.`,
            input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
            input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
          ]
        : [
            "amazon stage 1 analysis json",
            "Return JSON only.",
            "Top-level JSON keys must be exactly: mode, product_analysis, amazon_plan.",
            "mode must be amazon.",
            "Analyze the uploaded product image for a six-module Amazon detail/A+ workflow.",
            `Market: ${input.country}. Language: ${input.language}. Platform: ${input.platform}. Category: ${input.category}.`,
            `Brand: ${input.brandName}. Selling points: ${input.sellingPoints}. Restrictions: ${input.restrictions}.`,
            `Additional notes: ${input.sourceDescription}.`,
            input.materialInfo ? `Material information: ${input.materialInfo}.` : null,
            input.sizeInfo ? `Size information: ${normalizeSizeInfoToDualUnits(input.sizeInfo) ?? input.sizeInfo}.` : null,
          ];

  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      sourceImagePart,
      {
        text: sharedPrompt.filter(Boolean).join("\n"),
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema:
        input.mode === "standard"
          ? standardModeAnalysisSchema
          : input.mode === "suite"
            ? suiteSharedAnalysisSchema
            : amazonAPlusSharedAnalysisSchema,
      temperature: getSharedModeAnalysisTemperature(input.mode),
    },
  });

  if (input.mode === "standard") {
    const parsed = parseWorkflowJson<StandardModeAnalysis>(response.text);
    if (!parsed.subject_analysis || !parsed.reference_analysis || !parsed.visual_plan || !parsed.prompt_constraints) {
      throw new Error("Standard shared analysis JSON is incomplete.");
    }

    return {
      mode: input.mode,
      summary:
        trimWorkflowString(parsed.visual_plan.scene_description) ||
        trimWorkflowString(parsed.subject_analysis.main_subject) ||
        input.productName,
      productIdentity: trimWorkflowStringList(parsed.subject_analysis.must_keep, 8).join(", "),
      visualPriority: [parsed.visual_plan.style, parsed.visual_plan.composition, parsed.visual_plan.lighting]
        .map((value) => trimWorkflowString(value))
        .filter(Boolean)
        .join(" / "),
      materialAndStructure: [...trimWorkflowStringList(parsed.subject_analysis.material, 4), ...trimWorkflowStringList(parsed.subject_analysis.structure_features, 4)].join(", "),
      audience: "",
      platformTone: trimWorkflowString(parsed.reference_analysis.reference_role) || input.platform,
      usageScenarios: trimWorkflowStringList(parsed.visual_plan.focus_details, 4),
      typeHints: [trimWorkflowString(parsed.image_type || input.imageType || "scene")].filter(Boolean),
      negativeConstraints: trimWorkflowStringList(parsed.prompt_constraints.negative_keywords, 8),
      workflowWarning: "",
      referenceSummary: trimWorkflowString(parsed.reference_analysis.scene),
      referenceLayoutNotes: trimWorkflowString(parsed.reference_analysis.composition),
      sharedJson: parsed as unknown as Record<string, unknown>,
    };
  }

  if (input.mode === "suite") {
    const parsed = parseWorkflowJson<SetModeAnalysis>(response.text);
    if (!parsed.subject_analysis || !parsed.set_plan) {
      throw new Error("Suite shared analysis JSON is incomplete.");
    }

    return {
      mode: input.mode,
      summary: trimWorkflowString(parsed.subject_analysis.main_subject) || input.productName,
      productIdentity: trimWorkflowStringList(parsed.subject_analysis.must_keep, 8).join(", "),
      visualPriority: [parsed.set_plan.global_style, parsed.set_plan.global_color_tone, parsed.set_plan.global_brand_feel]
        .map((value) => trimWorkflowString(value))
        .filter(Boolean)
        .join(" / "),
      materialAndStructure: [...trimWorkflowStringList(parsed.subject_analysis.material, 4), ...trimWorkflowStringList(parsed.subject_analysis.structure_features, 4)].join(", "),
      audience: "",
      platformTone: trimWorkflowString(parsed.set_plan.global_brand_feel),
      usageScenarios: trimWorkflowStringList(parsed.subject_analysis.usage_scenarios, 4),
      typeHints: trimWorkflowStringList(parsed.set_plan.image_sequence, 6),
      negativeConstraints: trimWorkflowStringList(parsed.subject_analysis.must_keep, 8),
      workflowWarning: "",
      referenceSummary: "",
      referenceLayoutNotes: "",
      sharedJson: parsed as unknown as Record<string, unknown>,
    };
  }

  const parsed = parseWorkflowJson<AmazonModeAnalysis>(response.text);
  if (!parsed.product_analysis || !parsed.amazon_plan) {
    throw new Error("Amazon A+ shared analysis JSON is incomplete.");
  }

  return {
    mode: input.mode,
    summary: trimWorkflowString(parsed.product_analysis.main_subject) || input.productName,
    productIdentity: trimWorkflowStringList(parsed.product_analysis.must_keep, 8).join(", "),
    visualPriority: [parsed.amazon_plan.global_style, parsed.amazon_plan.global_color_tone, parsed.amazon_plan.global_brand_feel]
      .map((value) => trimWorkflowString(value))
      .filter(Boolean)
      .join(" / "),
    materialAndStructure: [...trimWorkflowStringList(parsed.product_analysis.material, 4), ...trimWorkflowStringList(parsed.product_analysis.structure_features, 4)].join(", "),
    audience: "",
    platformTone: trimWorkflowString(parsed.amazon_plan.global_brand_feel),
    usageScenarios: trimWorkflowStringList(parsed.product_analysis.usage_scenarios, 4),
    typeHints: trimWorkflowStringList(parsed.amazon_plan.module_sequence, 6),
    negativeConstraints: trimWorkflowStringList(parsed.product_analysis.must_keep, 8),
    workflowWarning: "",
    referenceSummary: "",
    referenceLayoutNotes: "",
    sharedJson: parsed as unknown as Record<string, unknown>,
  };
}

export async function generateModeWorkflowCopyBundle(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: WorkflowMode;
  imageType: ImageType;
  analysis: SharedWorkflowAnalysis | null;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  ratio: string;
  resolutionLabel: string;
  brandProfile?: BrandRecord | null;
  template?: TemplateRecord | null;
  baseCopy?: GeneratedCopyBundle;
}) {
  if (!input.analysis?.sharedJson) {
    return createWorkflowFallbackCopyBundle({
      ...input,
      reason: "Missing shared workflow analysis.",
    });
  }

  const ai = createClient(input);
  const referenceRemixFallbackPrompt =
    input.mode === "reference-remix"
      ? buildReferenceRemixFallbackOptimizedPrompt({
          sellingPoints: input.sellingPoints,
          restrictions: input.restrictions,
          sourceDescription: input.sourceDescription,
        })
      : "";
  const baseCopy =
    input.mode === "reference-remix"
      ? {
          ...(input.baseCopy ?? createWorkflowBaseCopy(input.productName, input.baseCopy)),
          optimizedPrompt: referenceRemixFallbackPrompt,
          title: input.baseCopy?.title || input.productName,
          posterHeadline: input.baseCopy?.posterHeadline || input.productName,
        }
      : createWorkflowBaseCopy(input.productName, input.baseCopy);

  try {
    if (input.mode === "reference-remix") {
      const response = await ai.models.generateContent({
        model: input.textModel,
        contents: [
          {
            text: buildReferenceRemixStage2PromptConversionPrompt({
              analysisJson: input.analysis.sharedJson,
              taskType: input.analysis.taskType,
              ratio: input.ratio,
              resolutionLabel: input.resolutionLabel,
              brandName: input.brandName,
              category: input.category,
              sellingPoints: input.sellingPoints,
              restrictions: input.restrictions,
              sourceDescription: input.sourceDescription,
            }),
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: referenceRemixPromptSchema,
          temperature: getModeWorkflowCopyTemperature(input.mode),
        },
      });

      const parsed = parseWorkflowJson<Partial<WorkflowTypePlan> & { task_type?: string }>(response.text);
      const negativePrompt = trimWorkflowString(parsed.negativePrompt) || defaultWorkflowNegativePrompt("zh-CN", input.mode);
      if (!trimWorkflowString(parsed.optimizedPrompt)) {
        throw new Error("Reference remix prompt conversion did not return optimizedPrompt.");
      }

      return buildWorkflowCopyBundle(
        baseCopy,
        parsed,
        input.mode,
        negativePrompt,
        trimWorkflowString(parsed.workflowWarning) || input.analysis.workflowWarning || "",
      );
    }

    if (input.mode === "standard") {
      const fallbackPrompt = buildStandardFallbackOptimizedPrompt({
        imageType: input.imageType,
        ratio: input.ratio,
        resolutionLabel: input.resolutionLabel,
        brandName: input.brandName,
        category: input.category,
        sellingPoints: input.sellingPoints,
        restrictions: input.restrictions,
        sourceDescription: input.sourceDescription,
      });
      const response = await ai.models.generateContent({
        model: input.textModel,
        contents: [
          {
            text: buildStandardStage2PromptConversionPrompt({
              analysisJson: input.analysis.sharedJson,
              ratio: input.ratio,
              resolutionLabel: input.resolutionLabel,
              imageType: input.imageType,
            }),
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: finalPromptConversionSchema,
          temperature: getModeWorkflowCopyTemperature(input.mode),
        },
      });

      const parsed = parseWorkflowJson<FinalPromptConversionJson>(response.text);
      return buildGeneratedCopyBundleFromPromptConversion({
        mode: input.mode,
        finalPrompt: trimWorkflowString(parsed.final_prompt),
        negativeConstraints: trimWorkflowStringList(parsed.negative_constraints, 12),
        fallbackPrompt,
        title: input.productName || input.imageType,
        highlights: trimWorkflowStringList((input.analysis.sharedJson as StandardModeAnalysis).visual_plan?.focus_details, 5),
      });
    }

    if (input.mode === "suite") {
      const sharedAnalysis = input.analysis.sharedJson as SetModeAnalysis;
      const planningJson = buildSetPerImagePlan(sharedAnalysis, {
        imageType: input.imageType,
        ratio: input.ratio,
      });
      const fallbackPrompt = buildSetFallbackOptimizedPrompt({
        imageType: input.imageType,
        ratio: input.ratio,
        resolutionLabel: input.resolutionLabel,
        sellingPoints: input.sellingPoints,
        restrictions: input.restrictions,
        sourceDescription: input.sourceDescription,
      });
      const response = await ai.models.generateContent({
        model: input.textModel,
        contents: [
          {
            text: buildSetPerImagePromptConversionPrompt({
              planningJson,
              subjectAnalysisJson: (sharedAnalysis.subject_analysis ?? {}) as Record<string, unknown>,
              ratio: input.ratio,
              resolutionLabel: input.resolutionLabel,
            }),
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: finalPromptConversionSchema,
          temperature: getModeWorkflowCopyTemperature(input.mode),
        },
      });

      const parsed = parseWorkflowJson<FinalPromptConversionJson>(response.text);
      return buildGeneratedCopyBundleFromPromptConversion({
        mode: input.mode,
        finalPrompt: trimWorkflowString(parsed.final_prompt),
        negativeConstraints: trimWorkflowStringList(parsed.negative_constraints, 12),
        fallbackPrompt,
        title: input.productName || planningJson.image_goal,
        highlights: planningJson.focus_points,
      });
    }

    const sharedAnalysis = input.analysis.sharedJson as AmazonModeAnalysis;
    const planningJson = buildAmazonPerModulePlan(sharedAnalysis, {
      imageType: input.imageType,
      ratio: input.ratio,
    });
    const fallbackPrompt = buildAmazonFallbackOptimizedPrompt({
      imageType: input.imageType,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
    });
    const response = await ai.models.generateContent({
      model: input.textModel,
      contents: [
        {
          text: buildAmazonPerModulePromptConversionPrompt({
            planningJson,
            productAnalysisJson: (sharedAnalysis.product_analysis ?? {}) as Record<string, unknown>,
            ratio: input.ratio,
            resolutionLabel: input.resolutionLabel,
          }),
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: finalPromptConversionSchema,
        temperature: getModeWorkflowCopyTemperature(input.mode),
      },
    });

    const parsed = parseWorkflowJson<FinalPromptConversionJson>(response.text);
    return buildGeneratedCopyBundleFromPromptConversion({
      mode: input.mode,
      finalPrompt: trimWorkflowString(parsed.final_prompt),
      negativeConstraints: trimWorkflowStringList(parsed.negative_constraints, 12),
      fallbackPrompt,
      title: input.productName || planningJson.module_goal,
      highlights: planningJson.focus_points,
    });
  } catch (error) {
    return createWorkflowFallbackCopyBundle({
      ...input,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
