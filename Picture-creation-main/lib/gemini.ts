import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { DEFAULT_INLINE_IMAGE_MAX_BYTES, getMaxImagesPerPromptForModel, isGemini3ImageModel } from "./image-model-limits.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { appendQualityEnhancements } from "./prompt-quality-enhancements.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { buildPromptModePrompt, buildSizeSpecVisualCopyLines, getImageTypeGuide, normalizeSizeInfoToDualUnits } from "./templates.ts";
// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import type {
  BrandRecord,
  AppSettings,
  GeneratedCopyBundle,
  ImageType,
  LocalizedCreativeInputs,
  MarketingImageStrategy,
  MarketingStrategy,
  ProviderDebugInfo,
  VisualAudit,
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

interface ProductImageFeatureAnalysis {
  mainSubject: string;
  categoryGuess: string;
  coreFeatures: string[];
  visualCharacteristics: string[];
  materialSignals: string[];
  mustPreserve: string[];
}

const productImageFeatureAnalysisSchema = {
  type: "object",
  required: [
    "mainSubject",
    "categoryGuess",
    "coreFeatures",
    "visualCharacteristics",
    "materialSignals",
    "mustPreserve",
  ],
  properties: {
    mainSubject: { type: "string" },
    categoryGuess: { type: "string" },
    coreFeatures: { type: "array", items: { type: "string" } },
    visualCharacteristics: { type: "array", items: { type: "string" } },
    materialSignals: { type: "array", items: { type: "string" } },
    mustPreserve: { type: "array", items: { type: "string" } },
  },
} as const;

const concisePromptSchema = {
  type: "object",
  required: ["prompt"],
  properties: {
    prompt: { type: "string" },
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
    optimizedPrompt: typeof parsed.optimizedPrompt === "string" ? parsed.optimizedPrompt : "",
    title: typeof parsed.title === "string" ? parsed.title : "",
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : "",
    highlights: parsed.highlights ?? [],
    detailAngles: parsed.detailAngles ?? [],
    painPoints: parsed.painPoints ?? [],
    cta: typeof parsed.cta === "string" ? parsed.cta : "",
    posterHeadline: typeof parsed.posterHeadline === "string" ? parsed.posterHeadline : "",
    posterSubline: typeof parsed.posterSubline === "string" ? parsed.posterSubline : "",
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

export function parseModelJsonResponse<T extends Record<string, unknown> = Record<string, unknown>>(rawText: string | undefined): T {
  const trimmed = (rawText ?? "").trim();
  if (!trimmed) {
    return {} as T;
  }

  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const normalized = fencedMatch ? fencedMatch[1]!.trim() : trimmed;
  return JSON.parse(normalized) as T;
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

const marketingStrategySchema = {
  type: "object",
  required: [
    "summary",
    "category_judgment",
    "product_stage",
    "target_audience",
    "core_purchase_motivations",
    "prioritized_selling_points",
    "recommended_visual_direction",
    "recommended_content_structure",
    "avoid_directions",
    "conversion_goal",
    "must_preserve_structural_truths",
    "text_overlay_policy",
  ],
  properties: {
    summary: { type: "string" },
    category_judgment: { type: "string" },
    product_stage: { type: "string" },
    target_audience: { type: "string" },
    core_purchase_motivations: { type: "array", items: { type: "string" } },
    prioritized_selling_points: { type: "array", items: { type: "string" } },
    recommended_visual_direction: { type: "string" },
    recommended_content_structure: { type: "array", items: { type: "string" } },
    avoid_directions: { type: "array", items: { type: "string" } },
    conversion_goal: { type: "string" },
    must_preserve_structural_truths: { type: "array", items: { type: "string" } },
    text_overlay_policy: { type: "string" },
  },
} as const;

const marketingImageStrategiesSchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "image_type",
          "title",
          "marketing_role",
          "primary_selling_point",
          "scene_type",
          "composition_guidance",
          "copy_space_guidance",
          "mood_lighting",
          "output_ratio",
          "why_needed",
        ],
        properties: {
          id: { type: "string" },
          image_type: { type: "string" },
          title: { type: "string" },
          marketing_role: { type: "string" },
          primary_selling_point: { type: "string" },
          scene_type: { type: "string" },
          composition_guidance: { type: "string" },
          copy_space_guidance: { type: "string" },
          mood_lighting: { type: "string" },
          output_ratio: { type: "string" },
          why_needed: { type: "string" },
        },
      },
    },
  },
} as const;

const visualAuditSchema = {
  type: "object",
  required: [
    "passes",
    "structure_pass",
    "text_pass",
    "secondary_subject_pass",
    "slot_distinctness_pass",
    "reason",
    "repair_hints",
  ],
  properties: {
    passes: { type: "boolean" },
    structure_pass: { type: "boolean" },
    text_pass: { type: "boolean" },
    secondary_subject_pass: { type: "boolean" },
    slot_distinctness_pass: { type: "boolean" },
    reason: { type: "string" },
    repair_hints: { type: "array", items: { type: "string" } },
  },
} as const;

function normalizeVisualAudit(parsed: Record<string, unknown>): VisualAudit {
  const structurePass = Boolean(parsed.structure_pass);
  const textPass = Boolean(parsed.text_pass);
  const secondarySubjectPass = Boolean(parsed.secondary_subject_pass);
  const slotDistinctnessPass = Boolean(parsed.slot_distinctness_pass);
  const explicitPass = Boolean(parsed.passes);
  return {
    passes: explicitPass && structurePass && textPass && secondarySubjectPass && slotDistinctnessPass,
    structurePass,
    textPass,
    secondarySubjectPass,
    slotDistinctnessPass,
    reason: trimWorkflowString(parsed.reason) || "Visual audit failed.",
    repairHints: trimWorkflowStringList(parsed.repair_hints, 8),
  };
}

function normalizeMarketingStrategy(parsed: Record<string, unknown>): MarketingStrategy {
  return {
    summary: trimWorkflowString(parsed.summary) || "Conversion-oriented visual strategy.",
    categoryJudgment: trimWorkflowString(parsed.category_judgment) || "General ecommerce product",
    productStage: trimWorkflowString(parsed.product_stage) || "Conversion",
    targetAudience: trimWorkflowString(parsed.target_audience) || "Intent-driven online shoppers",
    corePurchaseMotivations: trimWorkflowStringList(parsed.core_purchase_motivations, 6),
    prioritizedSellingPoints: trimWorkflowStringList(parsed.prioritized_selling_points, 8),
    recommendedVisualDirection:
      trimWorkflowString(parsed.recommended_visual_direction) || "Clear product-first commercial photography",
    recommendedContentStructure: trimWorkflowStringList(parsed.recommended_content_structure, 8),
    avoidDirections: trimWorkflowStringList(parsed.avoid_directions, 8),
    conversionGoal: trimWorkflowString(parsed.conversion_goal) || "Drive confident purchase intent",
    mustPreserveStructuralTruths: trimWorkflowStringList(parsed.must_preserve_structural_truths, 8),
    textOverlayPolicy: trimWorkflowString(parsed.text_overlay_policy) || "",
  };
}

type MarketingStrategyContext = {
  mode: "standard" | "suite" | "amazon-a-plus";
  category: string;
  productName: string;
  sellingPoints: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
};

type MarketingProfile = {
  key: string;
  categoryJudgment: string;
  targetAudience: string;
  corePurchaseMotivations: string[];
  prioritizedSellingPoints: string[];
  recommendedVisualDirection: string;
  recommendedContentStructure: string[];
  avoidDirections: string[];
  conversionGoal: string;
  mustPreserveStructuralTruths: string[];
  textOverlayPolicy: string;
};

function inferMarketingProfile(input: Omit<MarketingStrategyContext, "mode">): MarketingProfile {
  const haystack = [
    input.category,
    input.productName,
    input.sellingPoints,
    input.sourceDescription,
    input.materialInfo,
    input.sizeInfo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /lure|swimbait|bait|treble|hook|fishing|angler|articulated|jointed|predator|freshwater|bass|pike/.test(haystack)
  ) {
    return {
      key: "fishing-lure",
      categoryJudgment: "Articulated fishing lure for freshwater predator fishing",
      targetAudience: "Freshwater predator anglers judging realism, swimming action, and hook-up confidence",
      corePurchaseMotivations: [
        "Trigger strikes through lifelike shape and movement",
        "Trust the hardware, hook-up readiness, and durability",
        "Visualize believable in-water performance before purchase",
      ],
      prioritizedSellingPoints: [
        "Realistic fish-body profile and finish",
        "Segmented swimming action and articulated motion",
        "Treble hook hardware confidence and fish-ready durability",
      ],
      recommendedVisualDirection:
        "Conversion-first fishing creative with premium lure detail, believable action cues, and strong hardware trust proof",
      recommendedContentStructure: [
        "Hero conversion visual that sells realism immediately",
        "Swimming-action proof that explains segmented movement",
        "Hook and hardware trust proof with close detail",
        "Real-use or predator-strike context that helps the buyer imagine success",
      ],
      avoidDirections: [
        "Avoid abstract poster styling that hides lure mechanics or hook detail",
        "Avoid impossible splash effects or fake underwater drama that breaks product credibility",
        "Avoid cluttered infographic layouts that make the lure itself hard to read",
      ],
      conversionGoal: "Drive confidence that the lure looks realistic, moves believably, and is ready to fish.",
      mustPreserveStructuralTruths: [
        "Preserve the uploaded lure's actual body topology exactly.",
        "Do not add articulation joints if the source lure is single-body, and do not remove them if the source lure is segmented.",
        "Preserve diving lip shape and size.",
        "Preserve hook count and placement exactly.",
        "Preserve hardware layout, split rings, and overall lure proportions.",
      ],
      textOverlayPolicy:
        "No visible text, no badges, no logos, no watermarks, no labels, and no callout bubbles in the image. Do not render any visible text, badge, logo, watermark, label, or callout bubble in the image.",
    };
  }

  if (/beauty|serum|skincare|cosmetic|cream|makeup/.test(haystack)) {
    return {
      key: "beauty",
      categoryJudgment: "Beauty / skincare ecommerce product",
      targetAudience: "Beauty shoppers comparing visible benefits, trust, and premium feel",
      corePurchaseMotivations: [
        "See premium texture and packaging credibility",
        "Understand the clearest visible benefit promise",
        "Feel that the product belongs in an aspirational routine",
      ],
      prioritizedSellingPoints: [
        "Core visible benefit",
        "Premium packaging and formula credibility",
        "Routine fit and lifestyle desirability",
      ],
      recommendedVisualDirection: "Premium clean beauty photography with texture trust and aspirational ritual cues",
      recommendedContentStructure: [
        "Hero benefit visual",
        "Texture or formula proof",
        "Routine or lifestyle fit scene",
      ],
      avoidDirections: [
        "Avoid over-decorative props that hide the product",
        "Avoid fake science clutter that lowers trust",
      ],
      conversionGoal: "Turn premium impression into immediate benefit understanding and trust.",
      mustPreserveStructuralTruths: [
        "Preserve package silhouette, cap shape, bottle or jar proportions, and label placement.",
        "Do not invent extra accessories or change packaging architecture.",
      ],
      textOverlayPolicy:
        "No visible text, no badges, no logos, no watermarks, no labels, and no callout bubbles in the image. Do not render any visible text, badge, logo, watermark, label, or callout bubble in the image.",
    };
  }

  return {
    key: "generic",
    categoryJudgment: `${input.category || "General"} ecommerce product`,
    targetAudience: "Intent-driven online shoppers",
    corePurchaseMotivations: [
      "Understand the product's clearest value quickly",
      "Trust the product quality and practical fit",
      "Feel confident about purchase relevance",
    ],
    prioritizedSellingPoints: [
      "Primary product value proposition",
      "One trust-building proof point",
      "One practical usage or outcome proof",
    ],
    recommendedVisualDirection: "Clear product-first commercial photography",
    recommendedContentStructure: [
      "Hero conversion visual",
      "Benefit proof visual",
      "Trust or usage proof visual",
    ],
    avoidDirections: [
      "Avoid cluttered compositions that reduce product readability",
      "Avoid overly abstract styling that weakens conversion clarity",
    ],
    conversionGoal: "Drive confident purchase intent.",
    mustPreserveStructuralTruths: [
      "Preserve the uploaded product's body shape, core structure, material truth, and proportion exactly.",
      "Do not invent new structural parts that are not present in the source image.",
    ],
    textOverlayPolicy:
      "No visible text, no badges, no logos, no watermarks, no labels, and no callout bubbles in the image. Do not render any visible text, badge, logo, watermark, label, or callout bubble in the image.",
  };
}

export function finalizeMarketingStrategy(
  parsed: Record<string, unknown>,
  context: MarketingStrategyContext,
): MarketingStrategy {
  const normalized = normalizeMarketingStrategy(parsed);
  const profile = inferMarketingProfile(context);
  const genericAudience = !normalized.targetAudience || /intent-driven online shoppers/i.test(normalized.targetAudience);
  const genericCategory = !normalized.categoryJudgment || /general ecommerce product/i.test(normalized.categoryJudgment);
  const genericDirection =
    !normalized.recommendedVisualDirection || /clear product-first commercial photography/i.test(normalized.recommendedVisualDirection);

  return {
    summary:
      normalized.summary ||
      `${profile.categoryJudgment}. ${profile.recommendedVisualDirection}.`,
    categoryJudgment: genericCategory ? profile.categoryJudgment : normalized.categoryJudgment,
    productStage: normalized.productStage || "Conversion",
    targetAudience: genericAudience ? profile.targetAudience : normalized.targetAudience,
    corePurchaseMotivations: normalized.corePurchaseMotivations.length > 0 ? normalized.corePurchaseMotivations : profile.corePurchaseMotivations,
    prioritizedSellingPoints: normalized.prioritizedSellingPoints.length > 0 ? normalized.prioritizedSellingPoints : profile.prioritizedSellingPoints,
    recommendedVisualDirection: genericDirection ? profile.recommendedVisualDirection : normalized.recommendedVisualDirection,
    recommendedContentStructure:
      normalized.recommendedContentStructure.length > 0 ? normalized.recommendedContentStructure : profile.recommendedContentStructure,
    avoidDirections: normalized.avoidDirections.length > 0 ? normalized.avoidDirections : profile.avoidDirections,
    conversionGoal:
      normalized.conversionGoal && !/drive confident purchase intent/i.test(normalized.conversionGoal)
        ? normalized.conversionGoal
        : profile.conversionGoal,
    mustPreserveStructuralTruths:
      trimWorkflowStringList(parsed.must_preserve_structural_truths, 8).length > 0
        ? trimWorkflowStringList(parsed.must_preserve_structural_truths, 8)
        : profile.mustPreserveStructuralTruths,
    textOverlayPolicy:
      trimWorkflowString(parsed.text_overlay_policy) || profile.textOverlayPolicy,
  };
}

export function buildFallbackMarketingImageStrategies(
  mode: "standard" | "suite" | "amazon-a-plus",
  defaultRatio: string,
  context: {
    category: string;
    productName: string;
    sellingPoints: string;
    sourceDescription: string;
    sizeInfo?: string;
  },
): MarketingImageStrategy[] {
  const profile = inferMarketingProfile({
    category: context.category,
    productName: context.productName,
    sellingPoints: context.sellingPoints,
    sourceDescription: context.sourceDescription,
  });

  if (profile.key === "fishing-lure" && mode === "amazon-a-plus") {
    return filterSizeDrivenMarketingImageStrategies([
      {
        id: "hero-poster",
        imageType: "hero-poster",
        title: "Hero poster",
        marketingRole: "Drive click-through with a premium lure hero visual",
        primarySellingPoint: "Realistic fish-body finish and strike-triggering silhouette",
        sceneType: "Premium hero lure poster",
        compositionGuidance: "Single dominant lure hero with premium framing and strong visual hierarchy",
        copySpaceGuidance: "Reserve headline-safe whitespace without hiding the lure body",
        moodLighting: "High-clarity metallic scale light with premium contrast",
        outputRatio: defaultRatio,
        whyNeeded: "Sell realism and desirability at first glance.",
      },
      {
        id: "action-motion-proof",
        imageType: "action-motion-proof",
        title: "Swimming action proof",
        marketingRole: "Show why the lure creates believable swimming motion without changing its body topology",
        primarySellingPoint: "Believable swim path, body roll, and strike-triggering motion",
        sceneType: "Action demonstration scene",
        compositionGuidance: "Show the lure with motion-oriented framing that emphasizes swim path and body roll while preserving a single continuous body silhouette",
        copySpaceGuidance: "Use controlled side whitespace for one short action-led message",
        moodLighting: "Dynamic natural light with clear body contour separation and surface-energy realism",
        outputRatio: defaultRatio,
        whyNeeded: "Translate mechanics into strike-triggering performance.",
      },
      {
        id: "hook-hardware-proof",
        imageType: "hook-hardware-proof",
        title: "Hook and hardware proof",
        marketingRole: "Build trust in hook-up readiness and hardware durability",
        primarySellingPoint: "Treble hook and hardware confidence",
        sceneType: "Macro technical detail",
        compositionGuidance: "Tight detail framing that keeps hooks, joints, and hardware visibly trustworthy",
        copySpaceGuidance: "Small annotation-safe corners only",
        moodLighting: "Sharp detail-revealing technical light",
        outputRatio: defaultRatio,
        whyNeeded: "Reduce purchase hesitation around fish-ready reliability.",
      },
      {
        id: "water-use-scenario",
        imageType: "water-use-scenario",
        title: "Water-use scenario",
        marketingRole: "Help the buyer imagine real fishing success",
        primarySellingPoint: "Believable predator-fishing use case",
        sceneType: "Freshwater strike scenario",
        compositionGuidance: "Place the lure in a realistic fishing context without losing product readability",
        copySpaceGuidance: "Moderate edge whitespace for one proof-oriented callout",
        moodLighting: "Natural outdoor light with believable water context",
        outputRatio: defaultRatio,
        whyNeeded: "Turn product detail into in-use confidence.",
      },
    ], context.sizeInfo);
  }

  if (mode === "standard") {
    return filterSizeDrivenMarketingImageStrategies([
      {
        id: "hero-conversion",
        imageType: "hero-conversion",
        title: "Hero conversion visual",
        marketingRole: "Primary click-through and conversion image",
        primarySellingPoint: "Core product value",
        sceneType: "Commercial hero scene",
        compositionGuidance: "One dominant hero product with clear focal hierarchy",
        copySpaceGuidance: "Leave disciplined whitespace for optional copy",
        moodLighting: "Bright premium commercial light",
        outputRatio: defaultRatio,
        whyNeeded: "This image should sell the product at first glance.",
      },
    ], context.sizeInfo);
  }

  if (mode === "amazon-a-plus") {
    return filterSizeDrivenMarketingImageStrategies([
      {
        id: "hero-poster",
        imageType: "hero-poster",
        title: "Hero poster",
        marketingRole: "Establish the product promise and premium impression",
        primarySellingPoint: "Primary value proposition",
        sceneType: "Poster-style hero scene",
        compositionGuidance: "Large hero product with strong visual hierarchy",
        copySpaceGuidance: "Reserve large, structured copy-safe zones",
        moodLighting: "High-clarity premium advertising light",
        outputRatio: defaultRatio,
        whyNeeded: "Anchor the full A+ story.",
      },
      {
        id: "benefit-overview",
        imageType: "benefit-overview",
        title: "Benefit overview",
        marketingRole: "Summarize the top reasons to buy",
        primarySellingPoint: "Top benefit cluster",
        sceneType: "Feature infographic-style product scene",
        compositionGuidance: "Show product with benefit callout anchors",
        copySpaceGuidance: "Keep modular areas for benefit headlines",
        moodLighting: "Clean explanatory light",
        outputRatio: defaultRatio,
        whyNeeded: "Help the buyer understand value quickly.",
      },
      {
        id: "scenario-proof",
        imageType: "scenario-proof",
        title: "Usage scenario",
        marketingRole: "Show believable real-world use",
        primarySellingPoint: "Practical outcome",
        sceneType: "Lifestyle use case",
        compositionGuidance: "Product in a credible use moment",
        copySpaceGuidance: "Moderate edge whitespace for short proof copy",
        moodLighting: "Natural lifestyle light",
        outputRatio: defaultRatio,
        whyNeeded: "Turn features into buyer imagination.",
      },
      {
        id: "spec-proof",
        imageType: "spec-proof",
        title: "Specification proof",
        marketingRole: "Reduce hesitation with concrete facts",
        primarySellingPoint: "Specification trust point",
        sceneType: "Measured detail / comparison layout",
        compositionGuidance: "Structured spec-first composition",
        copySpaceGuidance: "Strong grid-like copy zones",
        moodLighting: "Clear technical product light",
        outputRatio: defaultRatio,
        whyNeeded: "Close rational objections.",
      },
    ], context.sizeInfo);
  }

  return filterSizeDrivenMarketingImageStrategies([
    {
      id: "hero-main",
      imageType: "hero-main",
      title: "Hero main image",
      marketingRole: "Drive first-click desire",
      primarySellingPoint: "Primary value proposition",
      sceneType: "Hero product scene",
      compositionGuidance: "Single dominant hero with premium framing",
      copySpaceGuidance: "Reserved whitespace for optional headline",
      moodLighting: "Bright premium light",
      outputRatio: defaultRatio,
      whyNeeded: "Anchor the set with the strongest conversion visual.",
    },
    {
      id: "benefit-proof",
      imageType: "benefit-proof",
      title: "Benefit proof",
      marketingRole: "Explain the strongest buying reason",
      primarySellingPoint: "Lead benefit",
      sceneType: "Benefit-led product scene",
      compositionGuidance: "Show product plus one dominant benefit cue",
      copySpaceGuidance: "Stable copy-safe region for benefit explanation",
      moodLighting: "Clear commercial detail light",
      outputRatio: defaultRatio,
      whyNeeded: "Translate promise into visible proof.",
    },
    {
      id: "detail-proof",
      imageType: "detail-proof",
      title: "Detail proof",
      marketingRole: "Build trust with product detail and craft evidence",
      primarySellingPoint: "Quality proof point",
      sceneType: "Close detail composition",
      compositionGuidance: "Macro or near-detail framing with controlled context",
      copySpaceGuidance: "Small clean margin for annotations",
      moodLighting: "Texture-revealing light",
      outputRatio: defaultRatio,
      whyNeeded: "Reduce buyer skepticism.",
    },
    {
      id: "scenario-conversion",
      imageType: "scenario-conversion",
      title: "Scenario conversion",
      marketingRole: "Help the buyer imagine ownership",
      primarySellingPoint: "Usage outcome",
      sceneType: "Lifestyle scene",
      compositionGuidance: "Believable use case with product clearly visible",
      copySpaceGuidance: "Light supporting whitespace only",
      moodLighting: "Natural aspirational light",
      outputRatio: defaultRatio,
      whyNeeded: "Make the product feel relevant in real life.",
    },
  ], context.sizeInfo);
}

export function filterSizeDrivenMarketingImageStrategies(
  strategies: MarketingImageStrategy[],
  sizeInfo?: string,
): MarketingImageStrategy[] {
  if (sizeInfo?.trim()) {
    return strategies;
  }

  return strategies.filter((strategy) => {
    const combined = [
      strategy.imageType,
      strategy.title,
      strategy.marketingRole,
      strategy.primarySellingPoint,
      strategy.sceneType,
      strategy.whyNeeded,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return !/size-spec|spec-proof|size|dimension|measurement|parameter|specification|规格|尺寸|参数/.test(combined);
  });
}

function normalizeMarketingImageStrategies(
  mode: "standard" | "suite" | "amazon-a-plus",
  parsed: Record<string, unknown>,
  defaultRatio: string,
  context: {
    category: string;
    productName: string;
    sellingPoints: string;
    sourceDescription: string;
    sizeInfo?: string;
  },
): MarketingImageStrategy[] {
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const normalized = items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const title = trimWorkflowString(record.title) || trimWorkflowString(record.image_type) || `Strategy ${index + 1}`;
      return {
        id: trimWorkflowString(record.id) || `strategy-${index + 1}`,
        imageType: trimWorkflowString(record.image_type) || `strategy-${index + 1}`,
        title,
        marketingRole: trimWorkflowString(record.marketing_role) || title,
        primarySellingPoint: trimWorkflowString(record.primary_selling_point) || "",
        sceneType: trimWorkflowString(record.scene_type) || "",
        compositionGuidance: trimWorkflowString(record.composition_guidance) || "",
        copySpaceGuidance: trimWorkflowString(record.copy_space_guidance) || "",
        moodLighting: trimWorkflowString(record.mood_lighting) || "",
        outputRatio: trimWorkflowString(record.output_ratio) || defaultRatio,
        whyNeeded: trimWorkflowString(record.why_needed) || "",
      } satisfies MarketingImageStrategy;
    })
    .filter((item): item is MarketingImageStrategy => Boolean(item));

  if (normalized.length > 0) {
    return filterSizeDrivenMarketingImageStrategies(mode === "standard" ? [normalized[0]!] : normalized, context.sizeInfo);
  }

  return buildFallbackMarketingImageStrategies(mode, defaultRatio, context);
}

function buildFallbackProductImageFeatures(context: {
  productName: string;
  category: string;
  sellingPoints: string;
  materialInfo?: string;
  sizeInfo?: string;
}): ProductImageFeatureAnalysis {
  const normalizedProductName = trimWorkflowString(context.productName) || "product";
  const sellingPointSignals = trimWorkflowStringList(context.sellingPoints.split(/[\n,，;；]/g), 4);
  const materialSignals = trimWorkflowStringList(
    [context.materialInfo, context.sizeInfo].filter(Boolean).join(", ").split(/[\n,，;；]/g),
    4,
  );

  return {
    mainSubject: normalizedProductName,
    categoryGuess: trimWorkflowString(context.category) || "general product",
    coreFeatures: sellingPointSignals.length ? sellingPointSignals : [normalizedProductName],
    visualCharacteristics: materialSignals.length ? materialSignals : [normalizedProductName],
    materialSignals: materialSignals.length ? materialSignals : [normalizedProductName],
    mustPreserve: [normalizedProductName, ...materialSignals].filter(Boolean).slice(0, 4),
  };
}

function normalizeProductImageFeatures(
  raw: Record<string, unknown>,
  context: {
    productName: string;
    category: string;
    sellingPoints: string;
    materialInfo?: string;
    sizeInfo?: string;
  },
): ProductImageFeatureAnalysis {
  const fallback = buildFallbackProductImageFeatures(context);

  return {
    mainSubject: trimWorkflowString(raw.mainSubject) || fallback.mainSubject,
    categoryGuess: trimWorkflowString(raw.categoryGuess) || fallback.categoryGuess,
    coreFeatures: trimWorkflowStringList(raw.coreFeatures, 6).length
      ? trimWorkflowStringList(raw.coreFeatures, 6)
      : fallback.coreFeatures,
    visualCharacteristics: trimWorkflowStringList(raw.visualCharacteristics, 6).length
      ? trimWorkflowStringList(raw.visualCharacteristics, 6)
      : fallback.visualCharacteristics,
    materialSignals: trimWorkflowStringList(raw.materialSignals, 6).length
      ? trimWorkflowStringList(raw.materialSignals, 6)
      : fallback.materialSignals,
    mustPreserve: trimWorkflowStringList(raw.mustPreserve, 6).length
      ? trimWorkflowStringList(raw.mustPreserve, 6)
      : fallback.mustPreserve,
  };
}

interface FeaturePromptScenarioPlan {
  family: string;
  marketingIntent: string;
  sceneDirection: string;
  subjectFocus: string;
  cameraLanguage: string;
  differentiationRule: string;
  copyEnabled: boolean;
  copyRule: string;
  antiPatternRule: string;
}

function detectFishingLureAnalysis(analysis: ProductImageFeatureAnalysis) {
  const combined = [
    analysis.mainSubject,
    analysis.categoryGuess,
    ...analysis.coreFeatures,
    ...analysis.visualCharacteristics,
    ...analysis.materialSignals,
    ...analysis.mustPreserve,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /fishing|lure|swimbait|bait|hook|propeller|treble|route?ya|鱼饵|路亚|三本钩|多节/.test(combined);
}

export function buildFeaturePromptScenarioPlan(input: {
  imageType: string;
  analysis: ProductImageFeatureAnalysis;
  groupIndex: number;
  groupCount: number;
  language: string;
}): FeaturePromptScenarioPlan {
  const isFishingLure = detectFishingLureAnalysis(input.analysis);
  const isMultiGroup = input.groupCount > 1;
  const isSecondOrLaterGroup = input.groupIndex > 1;
  const copyRuleBase =
    input.language.toLowerCase().startsWith("zh")
      ? "Allow one short headline and up to two short benefit lines only. If visible copy is rendered, use Simplified Chinese."
      : "Allow one short headline and up to two short benefit lines only.";
  const noCopyRule = "Do not render visible text, badges, labels, watermarks, or infographic callouts.";
  const differentiationRule = isMultiGroup
    ? isSecondOrLaterGroup
      ? "This group must feel materially different from earlier groups in scene family, camera language, and selling logic."
      : "Establish a strong primary scenario family for the first group."
    : "Use one strong scenario family only.";
  const antiPatternRule =
    "Do not produce a simple background replacement. Change the marketing scene, camera logic, and selling context meaningfully.";

  if (input.imageType === "feature-overview") {
    return {
      family: "copy_layout_benefit",
      marketingIntent: "Turn the strongest benefits into a copy-led ecommerce visual instead of a plain product shot.",
      sceneDirection: isFishingLure
        ? "Use a clean advertising composition that still shows the lure body clearly while reserving structured text zones."
        : "Use a clear benefit-led layout with disciplined whitespace and a strong product hero.",
      subjectFocus: isFishingLure
        ? "Keep the full lure, segmented body, red tail, and hardware readable while supporting one headline-led message."
        : "Keep the product identity clear while making room for concise benefit copy.",
      cameraLanguage: "Advertising layout composition with stable hero framing, readable text-safe zones, and non-chaotic product placement.",
      differentiationRule,
      copyEnabled: true,
      copyRule: copyRuleBase,
      antiPatternRule,
    };
  }

  if (input.imageType === "size-spec") {
    return {
      family: "size_spec_copy_layout",
      marketingIntent: "Turn the provided size data into a clear shopping-friendly dimension copy image.",
      sceneDirection: "Use a clean ecommerce explainer layout that places dimension arrows and labels outside the product silhouette whenever possible.",
      subjectFocus: "Mark length on the longest edge, width on the shortest edge, and height as the secondary dimension. Keep the product fully readable, place dimension labels in surrounding whitespace or outside the silhouette, and move weight into a separate info block.",
      cameraLanguage: "Measured product layout with technical clarity, strong surrounding whitespace, and dimension rails that stay outside the body.",
      differentiationRule,
      copyEnabled: true,
      copyRule:
        input.language.toLowerCase().startsWith("zh")
          ? "Visible copy must use Simplified Chinese dimension labels and dual-unit values such as 长 2.54cm/1in, 宽 5.08cm/2in. Do not invent measurements."
          : "Visible copy must use dimension labels and dual-unit values such as Length 2.54cm/1in, Width 5.08cm/2in. Do not invent measurements.",
      antiPatternRule:
        "Do not place dimension labels, arrows, or weight text directly over the product body. Keep measurement graphics in surrounding whitespace or detached info blocks outside the silhouette whenever possible.",
    };
  }

  if (input.imageType === "poster") {
    if (isFishingLure && isSecondOrLaterGroup) {
      return {
        family: "underwater_impact_poster",
        marketingIntent: "Create a dramatic conversion poster that feels action-led rather than catalog-like.",
        sceneDirection: "Place the lure in a dynamic underwater hero scene with energetic bubbles, directional light, and clear product dominance.",
        subjectFocus: "Keep the segmented lure body, red tail, hooks, and head propeller fully recognizable as the hero.",
        cameraLanguage: "Hero poster framing with motion energy, dramatic lighting, and one dominant focal subject.",
        differentiationRule,
        copyEnabled: true,
        copyRule: copyRuleBase,
        antiPatternRule,
      };
    }

    return {
      family: "outdoor_tactical_hero",
      marketingIntent: "Build a professional outdoor-gear hero image with stronger brand and performance cues.",
      sceneDirection: "Place the lure on wet basalt rock or a tactical fishing surface near dawn water, with droplets and premium atmosphere.",
      subjectFocus: "Show the whole lure as a rugged pro-grade tool, not just a floating product cutout.",
      cameraLanguage: "Low-angle or three-quarter hero framing with outdoor depth, controlled mood light, and premium ad staging.",
      differentiationRule,
      copyEnabled: true,
      copyRule: copyRuleBase,
      antiPatternRule,
    };
  }

  if (input.imageType === "detail") {
    if (isFishingLure && isSecondOrLaterGroup) {
      return {
        family: "craftsmanship_finish_proof",
        marketingIntent: "Prove finish quality, body texture, and premium lure craftsmanship.",
        sceneDirection: "Stay extremely close to the lure surface and tail finish while preserving at least one clear structural anchor.",
        subjectFocus: "Emphasize scale coating, finish transitions, red tail treatment, and one readable hardware anchor.",
        cameraLanguage: "Controlled macro detail shot with premium side light and a clean proof-oriented crop.",
        differentiationRule,
        copyEnabled: false,
        copyRule: noCopyRule,
        antiPatternRule,
      };
    }

    return {
      family: "engineering_macro_detail",
      marketingIntent: "Prove the mechanical credibility of the lure rather than just showing a pretty close-up.",
      sceneDirection: "Use an engineering-style macro that makes the joints, front propeller, hooks, and hardware feel trustworthy.",
      subjectFocus: "Prioritize hinge connection, metal hardware, propeller structure, and one clear body anchor.",
      cameraLanguage: "Macro proof shot with technical clarity, hard directional light, and deliberate structure-led framing.",
      differentiationRule,
      copyEnabled: false,
      copyRule: noCopyRule,
      antiPatternRule,
    };
  }

  if (input.imageType === "scene" && isFishingLure) {
    if (isSecondOrLaterGroup) {
      return {
        family: "outdoor_tactical_hero",
        marketingIntent: "Show the lure as serious outdoor gear with stronger ownership fantasy and pro-fishing atmosphere.",
        sceneDirection: "Use a tactical outdoor shoreline or basalt rock environment instead of another underwater pass.",
        subjectFocus: "Keep the lure as the only readable hero while adding wet surface, droplets, and outdoor context.",
        cameraLanguage: "Outdoor tactical hero framing with atmospheric depth and strong product-first staging.",
        differentiationRule,
        copyEnabled: false,
        copyRule: noCopyRule,
        antiPatternRule,
      };
    }

    return {
      family: "underwater_dynamic_action",
      marketingIntent: "Demonstrate believable swim action and real in-water use value.",
      sceneDirection: "Place the lure in clear underwater motion with bubbles, light rays, and natural aquatic environment.",
      subjectFocus: "Keep the lure body and hooks readable while showing swimming energy rather than a static product float.",
      cameraLanguage: "Underwater action framing with dynamic side-follow composition and clear lure dominance.",
      differentiationRule,
      copyEnabled: false,
      copyRule: noCopyRule,
      antiPatternRule,
    };
  }

  return {
    family: "commercial_environmental_product",
    marketingIntent: "Create a new commercial product scene that feels more intentional than a simple background swap.",
    sceneDirection: "Build a believable commercial environment aligned with the product's usage and buyer mindset.",
    subjectFocus: "Keep the product identity and key parts readable while using the environment to add marketing context.",
    cameraLanguage: "Commercial product framing with clear focal hierarchy and meaningful scene design.",
    differentiationRule,
    copyEnabled: false,
    copyRule: noCopyRule,
    antiPatternRule,
  };
}

function buildFeaturePromptFallback(input: {
  mode: "standard" | "suite" | "amazon-a-plus";
  analysis: ProductImageFeatureAnalysis;
  imageType: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  materialInfo?: string;
  sizeInfo?: string;
  ratio: string;
  resolutionLabel: string;
  language: string;
  groupIndex: number;
  groupCount: number;
  category: string;
}): string {
  const guide = getImageTypeGuide(input.imageType as ImageType);
  const scenarioPlan = buildFeaturePromptScenarioPlan({
    imageType: input.imageType,
    analysis: input.analysis,
    groupIndex: input.groupIndex,
    groupCount: input.groupCount,
    language: input.language,
  });
  const sizeCopyLines = input.imageType === "size-spec"
    ? buildSizeSpecVisualCopyLines({
        sizeInfo: input.sizeInfo,
        language: input.language,
      })
    : [];
  const promptText = [
    `Create one precise ecommerce product image for ${input.imageType}.`,
    guide?.intent ? `Type goal: ${guide.intent}` : null,
    "Treat the uploaded image as the source of truth.",
    "Subject consistency with the uploaded image is mandatory.",
    `Scenario family: ${scenarioPlan.family}.`,
    `Marketing intent: ${scenarioPlan.marketingIntent}`,
    `Scene direction: ${scenarioPlan.sceneDirection}`,
    `Subject focus: ${scenarioPlan.subjectFocus}`,
    `Camera language: ${scenarioPlan.cameraLanguage}`,
    scenarioPlan.differentiationRule,
    scenarioPlan.antiPatternRule,
    scenarioPlan.copyEnabled ? scenarioPlan.copyRule : scenarioPlan.copyRule,
    sizeCopyLines.length ? `Required visible size copy: ${sizeCopyLines.join(" | ")}.` : null,
    `Subject: ${input.analysis.mainSubject || input.productName}.`,
    `Keep true: ${input.analysis.mustPreserve.slice(0, 4).join(", ")}.`,
    input.analysis.coreFeatures.length ? `Focus: ${input.analysis.coreFeatures.slice(0, 3).join(", ")}.` : null,
    input.analysis.visualCharacteristics.length
      ? `Visual cues: ${input.analysis.visualCharacteristics.slice(0, 3).join(", ")}.`
      : null,
    guide?.extraPrompt || null,
    input.productName ? "Use the product name as a helper hint only when it agrees with the image." : null,
    input.brandName ? `Brand: ${input.brandName}.` : null,
    input.sellingPoints ? `Selling points: ${trimWorkflowString(input.sellingPoints)}.` : null,
    input.materialInfo ? `Material: ${trimWorkflowString(input.materialInfo)}.` : null,
    input.sizeInfo ? `Size specs: ${trimWorkflowString(input.sizeInfo)}.` : null,
    input.groupCount > 1 ? `Variant group ${input.groupIndex} of ${input.groupCount}. Keep the same product truth but vary composition slightly.` : null,
    `Ratio: ${input.ratio}. Fidelity target: ${input.resolutionLabel}.`,
  ]
    .filter(Boolean)
    .join("\n");

  return appendQualityEnhancements({
    promptText,
    context: {
      mode: input.mode,
      language: input.language,
      category: input.category,
      imageType: input.imageType,
    },
  });
}

export async function analyzeProductImageFeatures(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  sourceImages: Array<{ mimeType: string; buffer: Buffer }>;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  materialInfo?: string;
  sizeInfo?: string;
}): Promise<ProductImageFeatureAnalysis> {
  const ai = createClient(input);
  const contents = [
    ...input.sourceImages.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.buffer.toString("base64"),
      },
    })),
    {
      text: [
        "You are a calm and precise product image analysis expert.",
        "Analyze the uploaded main product image and extract only the product's core subject and feature characteristics.",
        "Stay objective and concise.",
        "Return JSON only.",
        "If a product name is provided, treat it as a helper hint and never let it override what is visible in the image.",
        buildPromptFactLine([
          ["Country", input.country],
          ["Language", input.language],
          ["Platform", input.platform],
          ["Category", input.category],
          ["Product name", input.productName],
          ["Brand", input.brandName],
        ]),
        buildPromptFactLine([["Selling points", input.sellingPoints]]),
        buildPromptFactLine([["Material information", input.materialInfo]]),
        buildPromptFactLine([["Size information", input.sizeInfo]]),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  const response = await ai.models.generateContent({
    model: input.textModel,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: productImageFeatureAnalysisSchema,
      temperature: 0.15,
    },
  });

  return normalizeProductImageFeatures(parseModelJsonResponse(response.text), {
    productName: input.productName,
    category: input.category,
    sellingPoints: input.sellingPoints,
    materialInfo: input.materialInfo,
    sizeInfo: input.sizeInfo,
  });
}

export async function generateFeaturePromptCopyBundle(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: "standard" | "suite" | "amazon-a-plus";
  sourceImages: Array<{ mimeType: string; buffer: Buffer }>;
  analysis: ProductImageFeatureAnalysis;
  imageType: string;
  country: string;
  language: string;
  platform: string;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  materialInfo?: string;
  sizeInfo?: string;
  ratio: string;
  resolutionLabel: string;
  groupIndex: number;
  groupCount: number;
}): Promise<GeneratedCopyBundle> {
  const fallbackPrompt = buildFeaturePromptFallback(input);
  const ai = createClient(input);
  const guide = getImageTypeGuide(input.imageType as ImageType);
  const scenarioPlan = buildFeaturePromptScenarioPlan({
    imageType: input.imageType,
    analysis: input.analysis,
    groupIndex: input.groupIndex,
    groupCount: input.groupCount,
    language: input.language,
  });
  const sizeCopyLines = input.imageType === "size-spec"
    ? buildSizeSpecVisualCopyLines({
        sizeInfo: input.sizeInfo,
        language: input.language,
      })
    : [];
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      ...input.sourceImages.map((image) => ({
        inlineData: {
          mimeType: image.mimeType,
          data: image.buffer.toString("base64"),
        },
      })),
      [
        "You are a concise ecommerce visual prompt expert.",
        "Use the uploaded product image itself together with the analysis JSON.",
        "Use the structured product facts only as supporting context.",
        "Return JSON only.",
        'Only output {"prompt":"..."} with no extra keys.',
        "Only write the final prompt content. Do not output analysis, markdown, or extra explanation.",
        "The final prompt must stay concise, precise, and commercially usable.",
        "Subject consistency with the uploaded image is mandatory.",
        "Keep the same main product identity, key structure, material feel, and distinctive parts from the uploaded image.",
        "Use the product name only as a helper hint when it is provided.",
        "Do not follow a fixed template or repeat one preset scene across every image.",
        "Choose the most commercially useful scene according to the product's actual structure, usage logic, and buyer needs.",
        "If the current group index is greater than 1, pick a meaningfully different selling angle instead of lightly rewriting the previous image.",
        "Do not produce a simple background replacement.",
        "The result must feel like a materially new marketing scene with a clear selling purpose.",
        buildPromptFactLine([
          ["Mode", input.mode],
          ["Country", input.country],
          ["Language", input.language],
          ["Platform", input.platform],
          ["Category", input.category],
          ["Image type", input.imageType],
          ["Product name", input.productName],
          ["Brand", input.brandName],
        ]),
        buildPromptFactLine([["Selling points", input.sellingPoints]]),
        buildPromptFactLine([["Material information", input.materialInfo]]),
        buildPromptFactLine([["Size information", input.sizeInfo]]),
        guide?.intent ? `Image-type intent: ${guide.intent}` : null,
        guide?.extraPrompt ? `Image-type visual focus: ${guide.extraPrompt}` : null,
        `Scenario planning hint (not a fixed template): ${scenarioPlan.family}.`,
        `Suggested marketing intent: ${scenarioPlan.marketingIntent}`,
        `Suggested scene direction: ${scenarioPlan.sceneDirection}`,
        `Suggested subject focus: ${scenarioPlan.subjectFocus}`,
        `Suggested camera language: ${scenarioPlan.cameraLanguage}`,
        `Variation rule: ${scenarioPlan.differentiationRule}`,
        `Anti-pattern rule: ${scenarioPlan.antiPatternRule}`,
        scenarioPlan.copyEnabled
          ? `Visible copy rule: ${scenarioPlan.copyRule}`
          : `Visible copy rule: ${scenarioPlan.copyRule}`,
        sizeCopyLines.length ? `Required visible size copy lines: ${sizeCopyLines.join(" | ")}` : null,
        `Image analysis JSON:\n${JSON.stringify(input.analysis, null, 2)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: concisePromptSchema,
      temperature: 0.2,
    },
  });

  const parsed = parseModelJsonResponse<{ prompt?: string }>(response.text);
  const optimizedPrompt = appendQualityEnhancements({
    promptText: sanitizeWorkflowOptimizedPrompt(trimWorkflowString(parsed.prompt), fallbackPrompt),
    context: {
      mode: input.mode,
      language: input.language,
      category: input.category,
      imageType: input.imageType,
    },
  });

  return {
    optimizedPrompt,
    title: input.imageType,
    subtitle: guide?.copyFocus || input.imageType,
    highlights: input.analysis.coreFeatures.slice(0, 3),
    detailAngles: input.analysis.visualCharacteristics.slice(0, 3),
    painPoints: [],
    cta: "",
    posterHeadline: input.productName || input.imageType,
    posterSubline: guide?.copyFocus || "",
  };
}

export async function generateMarketingStrategy(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: "standard" | "suite" | "amazon-a-plus";
  sourceImages: Array<{ mimeType: string; buffer: Buffer }>;
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
}): Promise<MarketingStrategy> {
  const ai = createClient(input);
  const modeGoal =
    input.mode === "standard"
      ? "Recommend the single strongest conversion direction for one hero image."
      : input.mode === "suite"
        ? "Recommend the best multi-image detail-page content structure. Do not assume a fixed 6-image template."
        : "Recommend the best A+ / long-detail module structure. Do not assume a fixed 6-module template.";

  const contents = [
    ...input.sourceImages.map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.buffer.toString("base64"),
      },
    })),
    {
      text: [
        "You are a senior ecommerce visual marketing strategist.",
        "Primary optimization goal: conversion.",
        "Analyze the uploaded product image(s) together with the structured business inputs, then return one JSON marketing strategy.",
        "Do not describe technical image defects unless they materially change the selling strategy.",
        "This is not a prompt-writing task yet. Focus on audience, selling logic, and visual marketing direction.",
        "Return JSON only.",
        "Do not leave the arrays empty. Always return at least 3 core purchase motivations, 3 prioritized selling points, 3 recommended content structure items, and 2 avoid directions.",
        "Category judgment must be more specific than a generic marketplace category when the product clues allow it.",
        "Always return must_preserve_structural_truths and text_overlay_policy.",
        modeGoal,
        buildPromptFactLine([
          ["Country", input.country],
          ["Language", input.language],
          ["Platform", input.platform],
          ["Category", input.category],
          ["Product name", input.productName],
          ["Brand", input.brandName],
        ]),
        buildPromptFactLine([["Selling points", input.sellingPoints]]),
        buildPromptFactLine([["Restrictions", input.restrictions]]),
        buildPromptFactLine([["Additional notes", input.sourceDescription]]),
        buildPromptFactLine([["Material information", input.materialInfo]]),
        buildPromptFactLine([["Size and weight information", input.sizeInfo]]),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];

  const response = await ai.models.generateContent({
    model: input.textModel,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: marketingStrategySchema,
      temperature: 0.25,
    },
  });

  return finalizeMarketingStrategy(parseModelJsonResponse(response.text), {
    mode: input.mode,
    category: input.category,
    productName: input.productName,
    sellingPoints: input.sellingPoints,
    sourceDescription: input.sourceDescription,
    materialInfo: input.materialInfo,
    sizeInfo: input.sizeInfo,
  });
}

export async function generateMarketingImageStrategies(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: "standard" | "suite" | "amazon-a-plus";
  marketingStrategy: MarketingStrategy;
  category: string;
  productName: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  defaultRatio: string;
}): Promise<MarketingImageStrategy[]> {
  const ai = createClient(input);
  const modeRule =
    input.mode === "standard"
      ? "Return exactly 1 image strategy."
      : input.mode === "suite"
        ? "Return 4 to 8 image strategies for a conversion-oriented detail-page set."
        : "Return 4 to 8 image strategies for an Amazon A+ style detail module system.";

  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      [
        "You are an ecommerce visual marketing planner.",
        "Expand the approved marketing strategy into per-image execution strategies.",
        "This is still not the final prompt-writing step.",
        "Return JSON only.",
        modeRule,
        `Default output ratio to prefer unless a strategy clearly needs another ratio: ${input.defaultRatio}.`,
        buildPromptFactLine([
          ["Mode", input.mode],
          ["Category", input.category],
          ["Product name", input.productName],
          ["Brand", input.brandName],
        ]),
        buildPromptFactLine([["Selling points", input.sellingPoints]]),
        buildPromptFactLine([["Restrictions", input.restrictions]]),
        buildPromptFactLine([["Additional notes", input.sourceDescription]]),
        buildPromptFactLine([["Material information", input.materialInfo]]),
        buildPromptFactLine([["Size and weight information", input.sizeInfo]]),
        `Approved marketing strategy JSON:\n${JSON.stringify(input.marketingStrategy, null, 2)}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: marketingImageStrategiesSchema,
      temperature: 0.28,
    },
  });

  return normalizeMarketingImageStrategies(input.mode, parseModelJsonResponse(response.text), input.defaultRatio, {
    category: input.category,
    productName: input.productName,
    sellingPoints: input.sellingPoints,
    sourceDescription: input.sourceDescription,
    sizeInfo: input.sizeInfo,
  });
}

function buildMarketingStrategyFallbackPrompt(input: {
  mode: "standard" | "suite" | "amazon-a-plus";
  marketingStrategy: MarketingStrategy;
  imageStrategy: MarketingImageStrategy;
  productName: string;
  language: string;
  category: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  ratio: string;
  resolutionLabel: string;
}) {
  return buildMarketingExecutionPrompt(input);
}

export function buildMarketingExecutionPrompt(input: {
  mode?: "standard" | "suite" | "amazon-a-plus";
  marketingStrategy: MarketingStrategy;
  imageStrategy: MarketingImageStrategy;
  productName: string;
  language?: string;
  category?: string;
  brandName: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
  ratio: string;
  resolutionLabel: string;
}) {
  const roleText = input.imageStrategy.marketingRole.toLowerCase();
  const sceneText = input.imageStrategy.sceneType.toLowerCase();
  const imageType = input.imageStrategy.imageType.toLowerCase();
  const contextText = [
    input.marketingStrategy.categoryJudgment,
    input.productName,
    input.sellingPoints,
    input.sourceDescription,
    input.materialInfo,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const isHeroSlot = /hero|click|poster/.test(roleText) || /hero|poster|main-image/.test(imageType);
  const isDetailSlot = /hook|hardware|detail|macro|spec/.test(roleText) || /hook|hardware|detail|macro|material|craft|size|spec/.test(imageType) || /macro|technical/.test(sceneText);
  const isFishingLure = /fishing|lure|swimbait|bait/.test(contextText);
  const executionExtras = [
    imageType === "hero-poster"
      ? "Camera direction: low three-quarter hero angle with a single dominant lure silhouette against a premium clean backdrop."
      : null,
    imageType === "action-motion-proof"
      ? "Camera direction: side-profile action angle that emphasizes a believable swim path, controlled body roll, and a realistic surface wake without changing the lure's body topology."
      : null,
    imageType === "hook-hardware-proof"
      ? "Camera direction: ultra-close macro on the treble hook, split ring, and joint hardware with metal-detail sharpness."
      : null,
    imageType === "water-use-scenario"
      ? "Camera direction: waterline perspective in a believable freshwater shoreline environment with predator-fishing context."
      : null,
    /hero|click|poster/.test(roleText)
      ? "Shot style: premium hero shot with center-weighted framing, disciplined negative space, and premium advertising backdrop control."
      : null,
    /motion|swimming|action/.test(roleText) || /action/.test(sceneText)
      ? "Shot style: dynamic angle with believable motion energy, action-forward composition cues, and single-body swim realism."
      : null,
    /hook|hardware|detail|macro|spec/.test(roleText) || /macro|technical/.test(sceneText)
      ? "Shot style: macro close-up with sharp metal detail, hook hardware focus, and technical trust-building clarity."
      : null,
    /water|freshwater|predator|outdoor|use/.test(roleText) || /water|freshwater|outdoor/.test(sceneText)
      ? "Shot style: believable freshwater outdoor use context with waterline realism and predator-fishing atmosphere."
      : null,
    isHeroSlot
      ? "Environment rule: Do not fall back to a plain white catalog background."
      : null,
    isHeroSlot
      ? "Environment rule: Do not render the product as an isolated object on empty white."
      : null,
    isHeroSlot
      ? "Environment rule: Keep a premium advertising backdrop, controlled shadow, and strong hero focal staging."
      : null,
    isDetailSlot
      ? "Composition rule: Do not settle for a generic close-up texture shot."
      : null,
    isDetailSlot
      ? "Composition rule: Keep at least two structural proof anchors visible in the frame."
      : null,
    isDetailSlot && isFishingLure
      ? "For fishing-lure proof shots, use a combination of diving lip, hook set, hardware connection, and body texture."
      : null,
    isDetailSlot && isFishingLure
      ? "At least one visible anchor must clearly prove the lure body itself."
      : null,
  ].filter(Boolean);

  const promptText = [
    "Create one conversion-oriented ecommerce product image.",
    `Overall marketing summary: ${input.marketingStrategy.summary}`,
    `Conversion goal: ${input.marketingStrategy.conversionGoal}`,
    `Audience: ${input.marketingStrategy.targetAudience}`,
    `Visual direction: ${input.marketingStrategy.recommendedVisualDirection}`,
    `Structural truth policy: ${input.marketingStrategy.mustPreserveStructuralTruths.join(" ")}`,
    `Text overlay policy: ${input.marketingStrategy.textOverlayPolicy}`,
    `Image role: ${input.imageStrategy.marketingRole}`,
    `Primary selling point: ${input.imageStrategy.primarySellingPoint}`,
    `Scene type: ${input.imageStrategy.sceneType}`,
    `Composition guidance: ${input.imageStrategy.compositionGuidance}`,
    `Copy-space guidance: ${input.imageStrategy.copySpaceGuidance}`,
    `Mood and lighting: ${input.imageStrategy.moodLighting}`,
    buildPromptFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
    ]),
    buildPromptFactLine([["Selling points", input.sellingPoints]]),
    buildPromptFactLine([["Restrictions", input.restrictions]]),
    buildPromptFactLine([["Additional notes", input.sourceDescription]]),
    buildPromptFactLine([["Material information", input.materialInfo]]),
    buildPromptFactLine([["Size and weight information", input.sizeInfo]]),
    "Structural truth is mandatory.",
    ...input.marketingStrategy.mustPreserveStructuralTruths,
    input.marketingStrategy.textOverlayPolicy,
    ...executionExtras,
    `Target ratio: ${input.imageStrategy.outputRatio || input.ratio}. Aim for ${input.resolutionLabel} level fidelity.`,
  ]
    .filter(Boolean)
    .join("\n");

  return appendQualityEnhancements({
    promptText,
    context: {
      mode: input.mode ?? "standard",
      language: input.language ?? "en-US",
      category: input.category ?? "general",
      imageType: input.imageStrategy.imageType,
    },
  });
}

export async function generateMarketingStrategyCopyBundle(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: "standard" | "suite" | "amazon-a-plus";
  marketingStrategy: MarketingStrategy;
  imageStrategy: MarketingImageStrategy;
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
}): Promise<GeneratedCopyBundle> {
  const ai = createClient(input);
  const fallbackPrompt = buildMarketingStrategyFallbackPrompt(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: [
      [
        "You are converting a visual marketing plan into one plain-text image generation prompt.",
        "Return JSON only using the standard copy bundle structure.",
        "Do not return markdown.",
        "The final prompt must be ordinary image-generation text, not strategy JSON.",
        buildPromptFactLine([
          ["Mode", input.mode],
          ["Country", input.country],
          ["Language", input.language],
          ["Platform", input.platform],
          ["Category", input.category],
          ["Product name", input.productName],
          ["Brand", input.brandName],
        ]),
        `Overall marketing strategy JSON:\n${JSON.stringify(input.marketingStrategy, null, 2)}`,
        `Current image strategy JSON:\n${JSON.stringify(input.imageStrategy, null, 2)}`,
        `Target ratio: ${input.ratio}. Resolution bucket: ${input.resolutionLabel}.`,
      ].join("\n"),
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: copySchema,
      temperature: 0.3,
    },
  });

  const parsed = parseCopyBundleResponse(response.text, input.imageStrategy.title || input.productName);
  if (!parsed.optimizedPrompt.trim()) {
    return {
      ...parsed,
      optimizedPrompt: fallbackPrompt,
      title: input.imageStrategy.title || input.productName,
      subtitle: input.imageStrategy.marketingRole,
      posterHeadline: input.imageStrategy.title || input.productName,
      posterSubline: input.imageStrategy.primarySellingPoint || "",
    };
  }

  return {
    ...parsed,
    optimizedPrompt: appendQualityEnhancements({
      promptText: parsed.optimizedPrompt,
      context: {
        mode: input.mode,
        language: input.language,
        category: input.category,
        imageType: input.imageStrategy.imageType,
      },
    }),
    title: parsed.title || input.imageStrategy.title || input.productName,
    subtitle: parsed.subtitle || input.imageStrategy.marketingRole || "",
    posterHeadline: parsed.posterHeadline || parsed.title || input.imageStrategy.title || input.productName,
    posterSubline: parsed.posterSubline || input.imageStrategy.primarySellingPoint || "",
  };
}

export async function runVisualAudit(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
  mode: "standard" | "suite" | "amazon-a-plus";
  sourceImages: Array<{ mimeType: string; buffer: Buffer }>;
  generatedImage: { mimeType: string; buffer: Buffer };
  marketingStrategy: MarketingStrategy;
  imageStrategy: MarketingImageStrategy;
  promptText: string;
}): Promise<VisualAudit> {
  const ai = createClient(input);
  const contents = [
    ...input.sourceImages.slice(0, 2).map((image) => ({
      inlineData: {
        mimeType: image.mimeType,
        data: image.buffer.toString("base64"),
      },
    })),
    {
      text: "The image(s) above are the source product truth reference.",
    },
    {
      inlineData: {
        mimeType: input.generatedImage.mimeType,
        data: input.generatedImage.buffer.toString("base64"),
      },
    },
    {
      text: [
        "The final image above is the generated candidate that must now be audited.",
        "You are a strict ecommerce visual quality auditor.",
        "Return JSON only.",
        "Fail structure_pass if the generated candidate changes product body topology, segment count, lip shape, hook count or placement, hardware layout, proportions, or key pattern truth from the source.",
        "Fail text_pass if any readable text, logo, watermark, badge, label, UI chip, icon bubble, or callout bubble appears when the text overlay policy forbids it.",
        "Fail secondary_subject_pass if a second identifiable animal, person, hand, fish, boat, or other competing subject appears. Background-only indistinct context can pass only if it does not compete with the lure.",
        "Fail slot_distinctness_pass if the image does not visually read like the intended slot or if it collapses into another slot's visual language.",
        "repair_hints must be short, imperative prompt edits for one retry only.",
        buildPromptFactLine([
          ["Mode", input.mode],
          ["Slot", input.imageStrategy.imageType],
          ["Slot title", input.imageStrategy.title],
        ]),
        `Marketing strategy JSON:\n${JSON.stringify(input.marketingStrategy, null, 2)}`,
        `Image strategy JSON:\n${JSON.stringify(input.imageStrategy, null, 2)}`,
        `Prompt used:\n${input.promptText}`,
      ].join("\n"),
    },
  ];

  const response = await ai.models.generateContent({
    model: input.textModel,
    contents,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: visualAuditSchema,
      temperature: 0.1,
    },
  });

  return normalizeVisualAudit(parseModelJsonResponse(response.text));
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
