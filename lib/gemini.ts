import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { DEFAULT_INLINE_IMAGE_MAX_BYTES, getMaxImagesPerPromptForModel, isGemini3ImageModel } from "@/lib/image-model-limits";
import {
  buildCopyPrompt,
  buildImagePrompt,
  buildPromptModePrompt,
  buildReferenceDirectRemakePrompt,
  normalizeSizeInfoToDualUnits,
  toGeneratedCopyBundleFromRemakePoster,
} from "@/lib/templates";
import type {
  BrandRecord,
  GeneratedCopyBundle,
  ImageType,
  LocalizedCreativeInputs,
  ProviderDebugInfo,
  ReferenceLayoutAnalysis,
  ReferencePosterCopy,
  TemplateRecord,
  UiLanguage,
} from "@/lib/types";

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
    customNegativePrompt: { type: "string" },
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

export function normalizeProviderError(error: unknown): string {
  if (error && typeof error === "object" && "providerDebug" in error) {
    const providerDebug = (error as { providerDebug?: ProviderDebugInfo | null }).providerDebug;
    if (providerDebug?.failureStage === "provider-request") {
      return "Provider request failed before a response was returned.";
    }
  }

  const raw = error instanceof Error ? error.message : String(error);

  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; status?: string } };
    if (parsed.error?.message) {
      return parsed.error.status ? `${parsed.error.message} (${parsed.error.status})` : parsed.error.message;
    }
  } catch {
    // ignore JSON parse failure
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
    contents: "Reply with OK only.",
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

export async function generateCopyBundle(input: {
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
  template?: TemplateRecord | null;
}): Promise<GeneratedCopyBundle> {
  const ai = createClient(input);
  const response = await ai.models.generateContent({
    model: input.textModel,
    contents: buildCopyPrompt(input),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: copySchema,
      temperature: 0.5,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as GeneratedCopyBundle;
  return {
    optimizedPrompt: parsed.optimizedPrompt,
    title: parsed.title,
    subtitle: parsed.subtitle,
    highlights: parsed.highlights ?? [],
    detailAngles: parsed.detailAngles ?? [],
    painPoints: parsed.painPoints ?? [],
    cta: parsed.cta,
    posterHeadline: parsed.posterHeadline,
    posterSubline: parsed.posterSubline,
  };
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
  customNegativePrompt?: string;
  translateToOutputLanguage?: boolean;
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
    "Always preserve the uploaded product identity, shape, material, label placement, and key visual truth.",
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
    input.customNegativePrompt?.trim() ? `Negative prompt / avoid: ${input.customNegativePrompt.trim()}` : "",
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
  customNegativePrompt?: string;
}): Promise<{ customPrompt: string; customNegativePrompt: string }> {
  const hasPrompt = Boolean(input.customPrompt.trim());
  const hasNegativePrompt = Boolean(input.customNegativePrompt?.trim());

  if (!hasPrompt && !hasNegativePrompt) {
    return {
      customPrompt: input.customPrompt,
      customNegativePrompt: input.customNegativePrompt?.trim() || "",
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

  if (hasNegativePrompt) {
    lines.push(`Negative prompt: ${input.customNegativePrompt?.trim()}`);
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
    customNegativePrompt?: string;
  };

  return {
    customPrompt: hasPrompt ? parsed.customPrompt?.trim() || input.customPrompt.trim() : "",
    customNegativePrompt: hasNegativePrompt ? parsed.customNegativePrompt?.trim() || input.customNegativePrompt?.trim() || "" : "",
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
  referenceRemakeGoal?: "hard-remake" | "soft-remake" | "structure-remake" | "semantic-remake";
  referenceStrength?: "reference" | "balanced" | "product";
  referenceCompositionLock?: "strict" | "balanced" | "flexible";
  referenceTextRegionPolicy?: "preserve" | "leave-space" | "remove";
  referenceBackgroundMode?: "preserve" | "simplify" | "regenerate";
  preserveReferenceText?: boolean;
  referenceCopyMode?: "reference" | "copy-sheet";
  variantsPerType?: number;
  customPromptText?: string;
  customNegativePrompt?: string;
  referenceExtraPrompt?: string;
  referenceNegativePrompt?: string;
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
}) {
  const ai = createClient(input);
  const imageConfig: Record<string, string> = {
    aspectRatio: input.ratio,
  };

  if (isGemini3ImageModel(input.imageModel)) {
    imageConfig.imageSize = input.resolutionLabel === "512px" ? "0.5K" : input.resolutionLabel;
  }

  const promptText =
    input.creationMode === "prompt" && input.customPromptText
      ? input.customPromptText
      : input.creationMode === "reference-remix"
      ? buildReferenceDirectRemakePrompt({
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
          ratio: input.ratio,
          resolutionLabel: input.resolutionLabel,
          referenceRemakeGoal: input.referenceRemakeGoal ?? "hard-remake",
          referenceStrength: input.referenceStrength ?? "balanced",
          referenceCompositionLock: input.referenceCompositionLock ?? "balanced",
          referenceTextRegionPolicy: input.referenceTextRegionPolicy ?? "preserve",
          referenceBackgroundMode: input.referenceBackgroundMode ?? "preserve",
          preserveReferenceText: input.preserveReferenceText ?? true,
          referenceCopyMode: input.referenceCopyMode ?? "reference",
          variants: input.variantsPerType ?? 1,
          referenceExtraPrompt: input.referenceExtraPrompt,
          referenceNegativePrompt: input.referenceNegativePrompt,
          referenceLayoutHints: input.referenceLayout,
          referencePosterCopyHints: input.referencePosterCopy,
          promptVariant: input.remakePromptVariant ?? "strict",
        })
      : input.creationMode === "prompt"
        ? buildPromptModePrompt({
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
            customPrompt: input.copy.optimizedPrompt,
            customNegativePrompt: input.customNegativePrompt,
          })
      : buildImagePrompt(input);

  const preparedImages = await Promise.all(input.sourceImages.map((image) => prepareImageForProvider(image)));
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
          temperature: 0.7,
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

export function buildRemakeCopyBundle(copy: ReferencePosterCopy): GeneratedCopyBundle {
  return toGeneratedCopyBundleFromRemakePoster(copy);
}
