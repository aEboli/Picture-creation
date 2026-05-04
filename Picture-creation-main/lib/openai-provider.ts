// @ts-ignore - Node test imports this file directly and needs the explicit extension.
import { appendQualityEnhancements } from "./prompt-quality-enhancements.ts";
// @ts-ignore
import { getImageTypeGuide, normalizeSizeInfoToDualUnits } from "./templates.ts";
// @ts-ignore
import type {
  BrandRecord,
  GeneratedCopyBundle,
  ImageType,
  MarketingImageStrategy,
  MarketingStrategy,
  ProviderDebugInfo,
  TemplateRecord,
  VisualAudit,
} from "./types.ts";
// @ts-ignore
import {
  buildStandardStage1AnalysisPrompt,
  buildStandardStage2PromptConversionPrompt,
  buildReferenceRemixStage1AnalysisPrompt,
  buildReferenceRemixStage2PromptConversionPrompt,
  buildSetStage1AnalysisPrompt,
  buildSetPerImagePromptConversionPrompt,
  buildAmazonStage1AnalysisPrompt,
  buildAmazonPerModulePromptConversionPrompt,
  resolveImageGenerationPromptText,
  parseCopyBundleResponse,
  parseModelJsonResponse,
  normalizeProviderError,
  getSharedModeAnalysisTemperature,
  getModeWorkflowCopyTemperature,
  getImageGenerationTemperature,
  sanitizeWorkflowOptimizedPrompt,
} from "./gemini";

// ---------------------------------------------------------------------------
// Local types matching gemini.ts internal interfaces
// ---------------------------------------------------------------------------

type WorkflowMode = "standard" | "suite" | "amazon-a-plus" | "reference-remix";

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

interface ProductImageFeatureAnalysis {
  mainSubject: string;
  categoryGuess: string;
  coreFeatures: string[];
  visualCharacteristics: string[];
  materialSignals: string[];
  mustPreserve: string[];
}

interface ProviderConfig {
  apiKey: string;
  apiBaseUrl?: string;
  apiVersion?: string;
  apiHeaders?: string;
}

const DEFAULT_OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_IMAGE_TOOL_MODEL = "gpt-image-2";
const OPENAI_IMAGE_TOOL_SIZE_SQUARE = "1024x1024";
const OPENAI_IMAGE_TOOL_SIZE_PORTRAIT = "1024x1536";
const OPENAI_IMAGE_TOOL_SIZE_LANDSCAPE = "1536x1024";
const OPENAI_IMAGE_TOOL_PORTRAIT_RATIO_THRESHOLD = 0.83;
const OPENAI_IMAGE_TOOL_LANDSCAPE_RATIO_THRESHOLD = 1.2;

export function resolveOpenAIResponsesUrl(apiBaseUrl?: string): string {
  const rawUrl = apiBaseUrl?.trim();
  if (!rawUrl) {
    return DEFAULT_OPENAI_RESPONSES_URL;
  }

  const normalizedUrl = rawUrl.replace(/\/+$/, "");
  if (/\/responses$/i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  return `${normalizedUrl}/responses`;
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function resolveOpenAIImageToolSize(input: {
  width?: number | null;
  height?: number | null;
}): string | undefined {
  if (!isPositiveFiniteNumber(input.width) || !isPositiveFiniteNumber(input.height)) {
    return undefined;
  }

  const targetRatio = input.width / input.height;
  if (targetRatio <= OPENAI_IMAGE_TOOL_PORTRAIT_RATIO_THRESHOLD) {
    return OPENAI_IMAGE_TOOL_SIZE_PORTRAIT;
  }

  if (targetRatio >= OPENAI_IMAGE_TOOL_LANDSCAPE_RATIO_THRESHOLD) {
    return OPENAI_IMAGE_TOOL_SIZE_LANDSCAPE;
  }

  return OPENAI_IMAGE_TOOL_SIZE_SQUARE;
}

function parseHeadersJson(rawHeaders?: string): Record<string, string> | undefined {
  if (!rawHeaders?.trim()) return undefined;
  try {
    const parsed = JSON.parse(rawHeaders);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") headers[key] = value;
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  } catch {
    return undefined;
  }
}

function buildOpenAIHeaders(config: ProviderConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    ...(parseHeadersJson(config.apiHeaders) ?? {}),
  };
}

async function createOpenAIHttpError(response: Response): Promise<Error & { status?: number }> {
  const raw = await response.text().catch(() => "");
  let message = raw.trim();

  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message || parsed.message || message;
    } catch {
      // Preserve the raw provider body when it is not JSON.
    }
  }

  const error = new Error(message || `OpenAI Responses request failed with HTTP ${response.status}.`) as Error & {
    status?: number;
  };
  error.status = response.status;
  return error;
}

async function createOpenAIResponse<T = any>(config: ProviderConfig, payload: Record<string, unknown>): Promise<T> {
  const responsesUrl = resolveOpenAIResponsesUrl(config.apiBaseUrl);
  const response = await fetch(responsesUrl, {
    method: "POST",
    headers: buildOpenAIHeaders(config),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await createOpenAIHttpError(response);
  }

  return (await response.json()) as T;
}

async function createOpenAIStreamResponse(config: ProviderConfig, payload: Record<string, unknown>): Promise<Response> {
  const responsesUrl = resolveOpenAIResponsesUrl(config.apiBaseUrl);
  const response = await fetch(responsesUrl, {
    method: "POST",
    headers: buildOpenAIHeaders(config),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await createOpenAIHttpError(response);
  }

  return response;
}

function findSseBoundary(buffer: string): { index: number; length: number } | null {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  const lfIndex = buffer.indexOf("\n\n");

  if (crlfIndex === -1 && lfIndex === -1) {
    return null;
  }
  if (crlfIndex === -1) {
    return { index: lfIndex, length: 2 };
  }
  if (lfIndex === -1 || crlfIndex < lfIndex) {
    return { index: crlfIndex, length: 4 };
  }
  return { index: lfIndex, length: 2 };
}

function parseSseEvent(rawEvent: string): any | null {
  const data = rawEvent
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") {
    return null;
  }

  return JSON.parse(data);
}

async function* iterateOpenAISseEvents(response: Response): AsyncGenerator<any> {
  if (!response.body) {
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let boundary = findSseBoundary(buffer);
    while (boundary) {
      const rawEvent = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      const event = parseSseEvent(rawEvent);
      if (event) {
        yield event;
      }
      boundary = findSseBoundary(buffer);
    }
  }

  buffer += decoder.decode();
  const tailEvent = parseSseEvent(buffer);
  if (tailEvent) {
    yield tailEvent;
  }
}

function extractTextFromResponse(response: any): string {
  // Responses API format: response.output[].content[].text
  if (response?.output) {
    for (const item of response.output) {
      if (item.content) {
        for (const part of item.content) {
          if (part.type === "output_text" && part.text) return part.text;
        }
      }
    }
  }
  // Fallback: chat completions format
  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content;
  }
  return "";
}

export async function testOpenAIConnection(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiHeaders?: string;
}): Promise<string> {
  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: "Reply with exactly: OK",
  });
  return extractTextFromResponse(response) || "OK";
}

export async function generateOpenAITextJson<T = Record<string, unknown>>(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiHeaders?: string;
  prompt: string;
  schema?: Record<string, unknown>;
  schemaName?: string;
}): Promise<T> {
  const params: any = {
    model: input.textModel,
    input: input.prompt,
  };

  if (input.schema) {
    params.text = {
      format: {
        type: "json_schema",
        name: input.schemaName || "output",
        schema: input.schema,
      },
    };
  }

  const response = await createOpenAIResponse(input, params);
  const text = extractTextFromResponse(response);
  return JSON.parse(text) as T;
}

export async function generateOpenAIText(input: {
  apiKey: string;
  textModel: string;
  apiBaseUrl?: string;
  apiHeaders?: string;
  prompt: string;
}): Promise<string> {
  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: input.prompt,
  });
  return extractTextFromResponse(response);
}

export async function generateOpenAIImage(input: {
  apiKey: string;
  imageModel: string;
  apiBaseUrl?: string;
  apiHeaders?: string;
  prompt: string;
  size?: string;
  images?: Array<{ mimeType: string; buffer: Buffer }>;
}): Promise<{ mimeType: string; buffer: Buffer }[]> {
  const requestInput = input.images?.length ? buildImagesMultimodalInput(input.images, input.prompt) : input.prompt;
  const imageTool: Record<string, unknown> = {
    type: "image_generation",
    model: OPENAI_IMAGE_TOOL_MODEL,
    action: "generate",
  };
  if (input.size) {
    imageTool.size = input.size;
  }

  const response = await createOpenAIStreamResponse(input, {
    model: input.imageModel || "gpt-5.5",
    input: requestInput,
    tools: [imageTool],
    stream: true,
  });

  const images: { mimeType: string; buffer: Buffer }[] = [];

  for await (const event of iterateOpenAISseEvents(response)) {
    if (
      event.type === "response.output_item.done" &&
      event.item?.type === "image_generation_call" &&
      event.item.result
    ) {
      const base64Data = event.item.result;
      const buffer = Buffer.from(base64Data, "base64");
      images.push({ mimeType: "image/png", buffer });
    }
  }

  if (images.length === 0) {
    throw new Error("No images were generated by the OpenAI image_generation tool.");
  }

  return images;
}

export function normalizeOpenAIError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);

  if (error && typeof error === "object" && "status" in error) {
    const status = (error as any).status;
    if (status === 401) return "API key is invalid or expired.";
    if (status === 429) return "Rate limit exceeded. Please try again later.";
    if (status === 500) return "OpenAI server error. Please try again later.";
  }

  return raw;
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
  referenceLayout?: any;
  referencePosterCopy?: any;
  template?: TemplateRecord | null;
  requestedWidth?: number | null;
  requestedHeight?: number | null;
  sourceImages: Array<{ mimeType: string; buffer: Buffer }>;
  referenceImages?: Array<{ mimeType: string; buffer: Buffer }>;
}): Promise<{ mimeType: string; buffer: Buffer; notes: string; promptText: string; providerDebug: ProviderDebugInfo }> {
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

  const allInputImages = [...input.sourceImages, ...(input.referenceImages ?? [])];
  const openAIImageToolSize = resolveOpenAIImageToolSize({
    width: input.requestedWidth,
    height: input.requestedHeight,
  });
  const images = await generateOpenAIImage({
    apiKey: input.apiKey,
    imageModel: input.imageModel,
    apiBaseUrl: input.apiBaseUrl,
    apiHeaders: input.apiHeaders,
    prompt: promptText,
    size: openAIImageToolSize,
    images: allInputImages,
  });

  const firstImage = images[0];
  return {
    mimeType: firstImage.mimeType,
    buffer: firstImage.buffer as Buffer<ArrayBuffer>,
    notes: "",
    promptText,
    providerDebug: {
      retrievalMethod: "inline",
      rawText: "",
      requestImageCount: allInputImages.length,
      requestBytes: allInputImages.reduce((t, img) => t + img.buffer.length, 0),
      openAIImageToolModel: OPENAI_IMAGE_TOOL_MODEL,
      openAIImageToolSize,
    },
  };
}

// ---------------------------------------------------------------------------
// Local helpers mirroring gemini.ts internals
// ---------------------------------------------------------------------------

function trimWs(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function trimWsList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, max);
}

function parseWorkflowJson<T extends object = Record<string, unknown>>(raw?: string): T {
  const cleaned = (raw ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  return JSON.parse(cleaned || "{}") as T;
}

function normalizePromptTextLocal(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildFactLine(facts: Array<[string, string | undefined | null]>): string | null {
  const parts = facts.flatMap(([label, value]) => {
    const normalized = normalizePromptTextLocal(value);
    return normalized ? [`${label}: ${normalized}`] : [];
  });
  return parts.length ? `${parts.join(". ")}.` : null;
}

function buildRestrictionsLineLocal(restrictions?: string | null): string | null {
  return buildFactLine([["Restrictions", restrictions ?? null]]);
}

function buildSimplifiedChineseOnlyLineLocal(language: string): string | null {
  return language.toLowerCase().startsWith("zh")
    ? "If any Chinese text appears anywhere in the output, use Simplified Chinese only. Do not use Traditional Chinese."
    : null;
}

function withNegativeConstraintsLocal(
  prompt: string,
  negativePrompt: string,
  mode: WorkflowMode,
): string {
  if (!negativePrompt.trim()) return prompt;
  const prefix = mode === "reference-remix" ? "Avoid" : "Negative constraints";
  return `${prompt}\n\n${prefix}: ${negativePrompt}`;
}

function defaultWorkflowNegativePrompt(language: string, mode: WorkflowMode): string {
  if (mode === "reference-remix") {
    return "No watermark, no signature, no border, no frame, no text overlay, no logo overlay, no extra limbs, no extra fingers, no deformed product.";
  }
  return "No watermark, no signature, no border, no frame, no text overlay, no logo overlay.";
}

function buildWorkflowFallbackCopyBundle(input: {
  mode: WorkflowMode;
  productName: string;
  imageType: ImageType;
  ratio: string;
  resolutionLabel: string;
  brandName: string;
  category: string;
  sellingPoints: string;
  restrictions: string;
  sourceDescription: string;
}): GeneratedCopyBundle {
  const negativePrompt = defaultWorkflowNegativePrompt("en", input.mode);
  const fallbackPrompt = [
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

  return {
    optimizedPrompt: withNegativeConstraintsLocal(fallbackPrompt, negativePrompt, input.mode),
    negativePrompt,
    workflowWarning: "Used fallback copy bundle.",
    title: input.productName || input.imageType,
    subtitle: "",
    highlights: [],
    detailAngles: [],
    painPoints: [],
    cta: "",
    posterHeadline: input.productName || input.imageType,
    posterSubline: "",
  };
}

function buildCopyBundleFromPromptConversion(input: {
  mode: WorkflowMode;
  finalPrompt: string;
  negativeConstraints: string[];
  fallbackPrompt: string;
  title: string;
  highlights?: string[];
  workflowWarning?: string;
}): GeneratedCopyBundle {
  const normalizedPrompt = sanitizeWorkflowOptimizedPrompt(input.finalPrompt, input.fallbackPrompt);
  const normalizedNegativePrompt = input.negativeConstraints.map((item) => item.trim()).filter(Boolean).join(", ");

  return {
    optimizedPrompt: withNegativeConstraintsLocal(normalizedPrompt || input.fallbackPrompt, normalizedNegativePrompt, input.mode),
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

function buildCopyBundleFromParsed(parsed: Partial<GeneratedCopyBundle>, mode: WorkflowMode, negativePrompt: string, workflowWarning: string, base: GeneratedCopyBundle): GeneratedCopyBundle {
  const fallbackPrompt = trimWs(base.optimizedPrompt);
  const optimizedPrompt = sanitizeWorkflowOptimizedPrompt(trimWs(parsed.optimizedPrompt), fallbackPrompt);

  return {
    optimizedPrompt: withNegativeConstraintsLocal(optimizedPrompt || fallbackPrompt, negativePrompt, mode),
    negativePrompt: negativePrompt.trim() || base.negativePrompt || "",
    workflowWarning: workflowWarning.trim() || base.workflowWarning || "",
    title: trimWs(parsed.title) || base.title,
    subtitle: trimWs(parsed.subtitle) || base.subtitle,
    highlights: trimWsList(parsed.highlights, 5),
    detailAngles: trimWsList(parsed.detailAngles, 4),
    painPoints: trimWsList(parsed.painPoints, 4),
    cta: trimWs(parsed.cta) || base.cta,
    posterHeadline: trimWs(parsed.posterHeadline) || base.posterHeadline,
    posterSubline: trimWs(parsed.posterSubline) || base.posterSubline,
  };
}

function buildBaseCopy(productName: string, baseCopy?: GeneratedCopyBundle | null): GeneratedCopyBundle {
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

function buildMultimodalInput(
  sourceImage: { mimeType: string; buffer: Buffer },
  referenceImage: { mimeType: string; buffer: Buffer } | null | undefined,
  promptText: string,
): any[] {
  const parts: any[] = [
    {
      type: "input_image",
      image_url: `data:${sourceImage.mimeType};base64,${sourceImage.buffer.toString("base64")}`,
    },
  ];
  if (referenceImage) {
    parts.push({
      type: "input_image",
      image_url: `data:${referenceImage.mimeType};base64,${referenceImage.buffer.toString("base64")}`,
    });
  }
  parts.push({ type: "input_text", text: promptText });
  return [{ role: "user", content: parts }];
}

function buildImagesMultimodalInput(
  images: Array<{ mimeType: string; buffer: Buffer }>,
  promptText: string,
): any[] {
  const parts: any[] = images.map((img) => ({
    type: "input_image",
    image_url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
  }));
  parts.push({ type: "input_text", text: promptText });
  return [{ role: "user", content: parts }];
}

function buildFeaturePromptFallbackLocal(input: {
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
  return [
    `Generate one ${input.imageType} for ${input.productName || "the product"}.`,
    input.brandName ? `Brand: ${input.brandName}.` : null,
    input.category ? `Category: ${input.category}.` : null,
    input.sellingPoints ? `Focus on: ${input.sellingPoints}.` : null,
    input.analysis.coreFeatures.length ? `Key features: ${input.analysis.coreFeatures.join(", ")}.` : null,
    input.materialInfo ? `Material: ${input.materialInfo}.` : null,
    `Target ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function splitFeatureSignalsLocal(value?: string | null, max = 6): string[] {
  return (value ?? "")
    .split(/[\n,;\uFF0C\uFF1B\u3001]/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, max);
}

function buildFallbackProductImageFeaturesLocal(context: {
  productName: string;
  category: string;
  sellingPoints: string;
  materialInfo?: string;
  sizeInfo?: string;
}): ProductImageFeatureAnalysis {
  const mainSubject = trimWs(context.productName) || "product";
  const sellingPointSignals = splitFeatureSignalsLocal(context.sellingPoints, 6);
  const materialSignals = [
    ...splitFeatureSignalsLocal(context.materialInfo, 4),
    ...splitFeatureSignalsLocal(context.sizeInfo, 2),
  ].slice(0, 6);

  return {
    mainSubject,
    categoryGuess: trimWs(context.category) || "general product",
    coreFeatures: sellingPointSignals.length ? sellingPointSignals : [mainSubject],
    visualCharacteristics: materialSignals.length ? materialSignals : [mainSubject],
    materialSignals: materialSignals.length ? materialSignals : [mainSubject],
    mustPreserve: [mainSubject, ...materialSignals].filter(Boolean).slice(0, 6),
  };
}

function normalizeProductImageFeaturesLocal(
  raw: Record<string, unknown>,
  context: {
    productName: string;
    category: string;
    sellingPoints: string;
    materialInfo?: string;
    sizeInfo?: string;
  },
): ProductImageFeatureAnalysis {
  const fallback = buildFallbackProductImageFeaturesLocal(context);
  const coreFeatures = trimWsList(raw.coreFeatures, 6);
  const visualCharacteristics = trimWsList(raw.visualCharacteristics, 6);
  const materialSignals = trimWsList(raw.materialSignals, 6);
  const mustPreserve = trimWsList(raw.mustPreserve, 6);

  return {
    mainSubject: trimWs(raw.mainSubject) || fallback.mainSubject,
    categoryGuess: trimWs(raw.categoryGuess) || fallback.categoryGuess,
    coreFeatures: coreFeatures.length ? coreFeatures : fallback.coreFeatures,
    visualCharacteristics: visualCharacteristics.length ? visualCharacteristics : fallback.visualCharacteristics,
    materialSignals: materialSignals.length ? materialSignals : fallback.materialSignals,
    mustPreserve: mustPreserve.length ? mustPreserve : fallback.mustPreserve,
  };
}

// ---------------------------------------------------------------------------
// Wrapper: analyzeProductImageFeatures
// ---------------------------------------------------------------------------

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
  const promptText = [
    "You are a calm and precise product image analysis expert.",
    "Analyze the uploaded main product image and extract only the product's core subject and feature characteristics.",
    "Stay objective and concise.",
    "Return JSON only.",
    "Only output keys: mainSubject, categoryGuess, coreFeatures, visualCharacteristics, materialSignals, mustPreserve.",
    "If a product name is provided, treat it as a helper hint and never let it override what is visible in the image.",
    buildFactLine([
      ["Country", input.country],
      ["Language", input.language],
      ["Platform", input.platform],
      ["Category", input.category],
      ["Product name", input.productName],
      ["Brand", input.brandName],
    ]),
    buildFactLine([["Selling points", input.sellingPoints]]),
    buildFactLine([["Material information", input.materialInfo]]),
    buildFactLine([["Size information", input.sizeInfo]]),
  ]
    .filter(Boolean)
    .join("\n");

  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: buildImagesMultimodalInput(input.sourceImages, promptText),
    text: { format: { type: "json_object" } },
    temperature: 0.15,
  });

  const parsed = parseModelJsonResponse(extractTextFromResponse(response));
  return normalizeProductImageFeaturesLocal(parsed, {
    productName: input.productName,
    category: input.category,
    sellingPoints: input.sellingPoints,
    materialInfo: input.materialInfo,
    sizeInfo: input.sizeInfo,
  });
}

// ---------------------------------------------------------------------------
// Wrapper: generateSharedModeAnalysis
// ---------------------------------------------------------------------------

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
}): Promise<SharedWorkflowAnalysis> {
  if (input.mode === "reference-remix") {
    if (!input.referenceImage) {
      throw new Error("Reference remix shared analysis requires a reference image.");
    }

    const prompt = buildReferenceRemixStage1AnalysisPrompt({
      brandName: input.brandName,
      category: input.category,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
      materialInfo: input.materialInfo,
      sizeInfo: input.sizeInfo,
    });

    const multimodalInput = buildMultimodalInput(input.sourceImage, input.referenceImage, prompt);
    const response = await createOpenAIResponse(input, {
      model: input.textModel,
      input: multimodalInput,
      text: { format: { type: "json_object" } },
      temperature: getSharedModeAnalysisTemperature(input.mode),
    });

    const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));

    if (
      !parsed.source_subject_analysis ||
      !parsed.reference_image_analysis ||
      !parsed.replication_strategy ||
      !parsed.output_plan
    ) {
      throw new Error("Reference remix shared analysis JSON is incomplete.");
    }

    const preservedFields = trimWsList(parsed.source_subject_analysis.preserved_source_fields, 8);
    const replicationDimensions = trimWsList(parsed.reference_image_analysis.core_replication_dimensions, 8);
    const cannotCopyDirectly = trimWsList(parsed.replication_strategy.cannot_copy_directly, 8);
    const adaptationNotes = trimWsList(parsed.replication_strategy.adaptation_notes, 8);
    const conflictResolution = trimWsList(parsed.replication_strategy.conflict_resolution, 8);

    return {
      mode: input.mode,
      summary:
        trimWs(parsed.reference_image_analysis.reference_summary) ||
        trimWs(parsed.source_subject_analysis.source_subject_summary) ||
        "reference remix",
      productIdentity: preservedFields.join(", "),
      visualPriority: replicationDimensions.join(", "),
      materialAndStructure: input.materialInfo?.trim() || preservedFields.join(", "),
      audience: "",
      platformTone: "reference remix",
      usageScenarios: trimWsList(parsed.output_plan.layered_execution_order, 6),
      typeHints: adaptationNotes,
      negativeConstraints: cannotCopyDirectly.length ? cannotCopyDirectly : [defaultWorkflowNegativePrompt("zh-CN", input.mode)],
      workflowWarning: "",
      referenceSummary: trimWs(parsed.reference_image_analysis.reference_summary),
      referenceLayoutNotes: [...adaptationNotes, ...conflictResolution].join(" / "),
      taskType: trimWs(parsed.task_type) || "营销图复刻",
      sharedJson: parsed as Record<string, unknown>,
    };
  }

  const standardPrompt = buildStandardStage1AnalysisPrompt({
    country: input.country,
    language: input.language,
    platform: input.platform,
    category: input.category,
    brandName: input.brandName,
    sellingPoints: input.sellingPoints,
    restrictions: input.restrictions,
    sourceDescription: input.sourceDescription,
    materialInfo: input.materialInfo,
    sizeInfo: input.sizeInfo,
    imageType: (input.imageType ?? "scene") as ImageType,
  });

  const sharedPrompt =
    input.mode === "standard"
      ? standardPrompt
      : input.mode === "suite"
        ? buildSetStage1AnalysisPrompt({
            country: input.country,
            language: input.language,
            platform: input.platform,
            category: input.category,
            brandName: input.brandName,
            sellingPoints: input.sellingPoints,
            restrictions: input.restrictions,
            sourceDescription: input.sourceDescription,
            materialInfo: input.materialInfo,
            sizeInfo: input.sizeInfo,
          })
        : buildAmazonStage1AnalysisPrompt({
            country: input.country,
            language: input.language,
            platform: input.platform,
            category: input.category,
            brandName: input.brandName,
            sellingPoints: input.sellingPoints,
            restrictions: input.restrictions,
            sourceDescription: input.sourceDescription,
            materialInfo: input.materialInfo,
            sizeInfo: input.sizeInfo,
          });

  const multimodalInput = buildMultimodalInput(input.sourceImage, input.referenceImage, sharedPrompt);
  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: multimodalInput,
    text: { format: { type: "json_object" } },
    temperature: getSharedModeAnalysisTemperature(input.mode),
  });

  if (input.mode === "standard") {
    const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
    if (!parsed.subject_analysis || !parsed.reference_analysis || !parsed.visual_plan || !parsed.prompt_constraints) {
      throw new Error("Standard shared analysis JSON is incomplete.");
    }

    return {
      mode: input.mode,
      summary:
        trimWs(parsed.visual_plan.scene_description) ||
        trimWs(parsed.subject_analysis.main_subject) ||
        input.productName,
      productIdentity: trimWsList(parsed.subject_analysis.must_keep, 8).join(", "),
      visualPriority: [parsed.visual_plan.style, parsed.visual_plan.composition, parsed.visual_plan.lighting]
        .map((v: any) => trimWs(v))
        .filter(Boolean)
        .join(" / "),
      materialAndStructure: [...trimWsList(parsed.subject_analysis.material, 4), ...trimWsList(parsed.subject_analysis.structure_features, 4)].join(", "),
      audience: "",
      platformTone: trimWs(parsed.reference_analysis.reference_role) || input.platform,
      usageScenarios: trimWsList(parsed.visual_plan.focus_details, 4),
      typeHints: [trimWs(parsed.image_type || input.imageType || "scene")].filter(Boolean),
      negativeConstraints: trimWsList(parsed.prompt_constraints.negative_keywords, 8),
      workflowWarning: "",
      referenceSummary: trimWs(parsed.reference_analysis.scene),
      referenceLayoutNotes: trimWs(parsed.reference_analysis.composition),
      sharedJson: parsed as Record<string, unknown>,
    };
  }

  if (input.mode === "suite") {
    const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
    if (!parsed.subject_analysis || !parsed.set_plan) {
      throw new Error("Suite shared analysis JSON is incomplete.");
    }

    return {
      mode: input.mode,
      summary: trimWs(parsed.subject_analysis.main_subject) || input.productName,
      productIdentity: trimWsList(parsed.subject_analysis.must_keep, 8).join(", "),
      visualPriority: [parsed.set_plan.global_style, parsed.set_plan.global_color_tone, parsed.set_plan.global_brand_feel]
        .map((v: any) => trimWs(v))
        .filter(Boolean)
        .join(" / "),
      materialAndStructure: [...trimWsList(parsed.subject_analysis.material, 4), ...trimWsList(parsed.subject_analysis.structure_features, 4)].join(", "),
      audience: "",
      platformTone: trimWs(parsed.set_plan.global_brand_feel),
      usageScenarios: trimWsList(parsed.subject_analysis.usage_scenarios, 4),
      typeHints: trimWsList(parsed.set_plan.image_sequence, 6),
      negativeConstraints: trimWsList(parsed.subject_analysis.must_keep, 8),
      workflowWarning: "",
      referenceSummary: "",
      referenceLayoutNotes: "",
      sharedJson: parsed as Record<string, unknown>,
    };
  }

  // amazon-a-plus
  const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
  if (!parsed.product_analysis || !parsed.amazon_plan) {
    throw new Error("Amazon A+ shared analysis JSON is incomplete.");
  }

  return {
    mode: input.mode,
    summary: trimWs(parsed.product_analysis.main_subject) || input.productName,
    productIdentity: trimWsList(parsed.product_analysis.must_keep, 8).join(", "),
    visualPriority: [parsed.amazon_plan.global_style, parsed.amazon_plan.global_color_tone, parsed.amazon_plan.global_brand_feel]
      .map((v: any) => trimWs(v))
      .filter(Boolean)
      .join(" / "),
    materialAndStructure: [...trimWsList(parsed.product_analysis.material, 4), ...trimWsList(parsed.product_analysis.structure_features, 4)].join(", "),
    audience: "",
    platformTone: trimWs(parsed.amazon_plan.global_brand_feel),
    usageScenarios: trimWsList(parsed.product_analysis.usage_scenarios, 4),
    typeHints: trimWsList(parsed.amazon_plan.module_sequence, 6),
    negativeConstraints: trimWsList(parsed.product_analysis.must_keep, 8),
    workflowWarning: "",
    referenceSummary: "",
    referenceLayoutNotes: "",
    sharedJson: parsed as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Wrapper: generateModeWorkflowCopyBundle
// ---------------------------------------------------------------------------

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
}): Promise<GeneratedCopyBundle> {
  if (!input.analysis?.sharedJson) {
    return buildWorkflowFallbackCopyBundle({
      mode: input.mode,
      productName: input.productName,
      imageType: input.imageType,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      brandName: input.brandName,
      category: input.category,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
    });
  }

  if (input.mode === "reference-remix") {
    const prompt = buildReferenceRemixStage2PromptConversionPrompt({
      analysisJson: input.analysis.sharedJson,
      taskType: input.analysis.taskType,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      brandName: input.brandName,
      category: input.category,
      sellingPoints: input.sellingPoints,
      restrictions: input.restrictions,
      sourceDescription: input.sourceDescription,
    });

    const response = await createOpenAIResponse(input, {
      model: input.textModel,
      input: prompt,
      text: { format: { type: "json_object" } },
      temperature: getModeWorkflowCopyTemperature(input.mode),
    });

    const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
    const negativePrompt = trimWs(parsed.negativePrompt) || defaultWorkflowNegativePrompt("zh-CN", input.mode);
    if (!trimWs(parsed.optimizedPrompt)) {
      throw new Error("Reference remix prompt conversion did not return optimizedPrompt.");
    }

    const referenceRemixFallbackPrompt = `Product: ${input.productName}. Selling points: ${input.sellingPoints}.`;
    const base = {
      ...buildBaseCopy(input.productName, input.baseCopy),
      optimizedPrompt: referenceRemixFallbackPrompt,
      title: input.baseCopy?.title || input.productName,
      posterHeadline: input.baseCopy?.posterHeadline || input.productName,
    };

    return buildCopyBundleFromParsed(parsed, input.mode, negativePrompt, trimWs(parsed.workflowWarning) || input.analysis.workflowWarning || "", base);
  }

  if (input.mode === "standard") {
    const fallbackPrompt = [
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

    const prompt = buildStandardStage2PromptConversionPrompt({
      analysisJson: input.analysis.sharedJson,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
      imageType: input.imageType,
    });

    const response = await createOpenAIResponse(input, {
      model: input.textModel,
      input: prompt,
      text: { format: { type: "json_object" } },
      temperature: getModeWorkflowCopyTemperature(input.mode),
    });

    const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
    return buildCopyBundleFromPromptConversion({
      mode: input.mode,
      finalPrompt: trimWs(parsed.final_prompt),
      negativeConstraints: trimWsList(parsed.negative_constraints, 12),
      fallbackPrompt,
      title: input.productName || input.imageType,
      highlights: trimWsList((input.analysis.sharedJson as any)?.visual_plan?.focus_details, 5),
    });
  }

  if (input.mode === "suite") {
    const sharedAnalysis = input.analysis.sharedJson as any;
    const planningJson = {
      image_type: input.imageType,
      image_goal: "",
      focus_points: [],
      scene_description: "",
      background_plan: "",
      composition: "",
      camera_angle: "",
      shot_size: "",
      lighting: "",
      copy_space: "",
      output_ratio: input.ratio || sharedAnalysis?.set_plan?.image_sequence?.[0] || "1:1",
    };
    const fallbackPrompt = [
      `Generate one ${input.imageType} for a product suite listing.`,
      input.sellingPoints ? `Focus on: ${input.sellingPoints}.` : null,
      input.sourceDescription ? `Additional notes: ${input.sourceDescription}.` : null,
      `Target ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
      input.restrictions ? `Restrictions: ${input.restrictions}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const prompt = buildSetPerImagePromptConversionPrompt({
      planningJson: planningJson as any,
      subjectAnalysisJson: (sharedAnalysis?.subject_analysis ?? {}) as Record<string, unknown>,
      ratio: input.ratio,
      resolutionLabel: input.resolutionLabel,
    });

    const response = await createOpenAIResponse(input, {
      model: input.textModel,
      input: prompt,
      text: { format: { type: "json_object" } },
      temperature: getModeWorkflowCopyTemperature(input.mode),
    });

    const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
    return buildCopyBundleFromPromptConversion({
      mode: input.mode,
      finalPrompt: trimWs(parsed.final_prompt),
      negativeConstraints: trimWsList(parsed.negative_constraints, 12),
      fallbackPrompt,
      title: input.productName || input.imageType,
      highlights: trimWsList(sharedAnalysis?.subject_analysis?.usage_scenarios, 5),
    });
  }

  // amazon-a-plus
  const sharedAnalysis = input.analysis.sharedJson as any;
  const planningJson = {
    module_name: input.imageType,
    module_goal: "",
    focus_points: [],
    scene_description: "",
    background_plan: "",
    composition: "",
    camera_angle: "",
    lighting: "",
    copy_space: "",
    information_density: "",
    output_ratio: input.ratio || sharedAnalysis?.amazon_plan?.module_sequence?.[0] || "1:1",
  };
  const fallbackPrompt = [
    `Generate one ${input.imageType} module for an Amazon A+ listing.`,
    input.sellingPoints ? `Focus on: ${input.sellingPoints}.` : null,
    input.sourceDescription ? `Additional notes: ${input.sourceDescription}.` : null,
    `Target ratio: ${input.ratio}. Resolution: ${input.resolutionLabel}.`,
    input.restrictions ? `Restrictions: ${input.restrictions}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const prompt = buildAmazonPerModulePromptConversionPrompt({
    planningJson: planningJson as any,
    productAnalysisJson: (sharedAnalysis?.product_analysis ?? {}) as Record<string, unknown>,
    ratio: input.ratio,
    resolutionLabel: input.resolutionLabel,
  });

  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: prompt,
    text: { format: { type: "json_object" } },
    temperature: getModeWorkflowCopyTemperature(input.mode),
  });

  const parsed = parseWorkflowJson<any>(extractTextFromResponse(response));
  return buildCopyBundleFromPromptConversion({
    mode: input.mode,
    finalPrompt: trimWs(parsed.final_prompt),
    negativeConstraints: trimWsList(parsed.negative_constraints, 12),
    fallbackPrompt,
    title: input.productName || input.imageType,
    highlights: trimWsList(sharedAnalysis?.product_analysis?.core_selling_points, 5),
  });
}

// ---------------------------------------------------------------------------
// Wrapper: generateFeaturePromptCopyBundle
// ---------------------------------------------------------------------------

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
  const fallbackPrompt = buildFeaturePromptFallbackLocal(input);
  const guide = getImageTypeGuide(input.imageType as ImageType);

  const promptText = [
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
    buildFactLine([
      ["Mode", input.mode],
      ["Country", input.country],
      ["Language", input.language],
      ["Platform", input.platform],
      ["Category", input.category],
      ["Image type", input.imageType],
      ["Product name", input.productName],
      ["Brand", input.brandName],
    ]),
    buildFactLine([["Selling points", input.sellingPoints]]),
    buildFactLine([["Material information", input.materialInfo]]),
    buildFactLine([["Size information", input.sizeInfo]]),
    guide?.intent ? `Image-type intent: ${guide.intent}` : null,
    guide?.extraPrompt ? `Image-type visual focus: ${guide.extraPrompt}` : null,
    `Image analysis JSON:\n${JSON.stringify(input.analysis, null, 2)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const multimodalInput = buildImagesMultimodalInput(input.sourceImages, promptText);
  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: multimodalInput,
    text: { format: { type: "json_object" } },
    temperature: 0.2,
  });

  try {
    const parsed = parseModelJsonResponse<{ prompt?: string }>(extractTextFromResponse(response));
    const optimizedPrompt = appendQualityEnhancements({
      promptText: sanitizeWorkflowOptimizedPrompt(trimWs(parsed.prompt), fallbackPrompt),
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
  } catch {
    return {
      optimizedPrompt: fallbackPrompt,
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
}

// ---------------------------------------------------------------------------
// Wrapper: runVisualAudit
// ---------------------------------------------------------------------------

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
  const auditPrompt = [
    "The image(s) above are the source product truth reference.",
    "The final image below is the generated candidate that must now be audited.",
    "You are a strict ecommerce visual quality auditor.",
    "Return JSON only.",
    "Fail structure_pass if the generated candidate changes product body topology, segment count, lip shape, hook count or placement, hardware layout, proportions, or key pattern truth from the source.",
    "Fail text_pass if any readable text, logo, watermark, badge, label, UI chip, icon bubble, or callout bubble appears when the text overlay policy forbids it.",
    "Fail secondary_subject_pass if a second identifiable animal, person, hand, fish, boat, or other competing subject appears. Background-only indistinct context can pass only if it does not compete with the lure.",
    "Fail slot_distinctness_pass if the image does not visually read like the intended slot or if it collapses into another slot's visual language.",
    "repair_hints must be short, imperative prompt edits for one retry only.",
    buildFactLine([
      ["Mode", input.mode],
      ["Slot", input.imageStrategy.imageType],
      ["Slot title", input.imageStrategy.title],
    ]),
    `Marketing strategy JSON:\n${JSON.stringify(input.marketingStrategy, null, 2)}`,
    `Image strategy JSON:\n${JSON.stringify(input.imageStrategy, null, 2)}`,
    `Prompt used:\n${input.promptText}`,
  ]
    .filter(Boolean)
    .join("\n");

  // Build multimodal: source images, then text, then generated image
  const parts: any[] = [];
  for (const img of input.sourceImages.slice(0, 2)) {
    parts.push({
      type: "input_image",
      image_url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`,
    });
  }
  parts.push({ type: "input_text", text: auditPrompt });
  parts.push({
    type: "input_image",
    image_url: `data:${input.generatedImage.mimeType};base64,${input.generatedImage.buffer.toString("base64")}`,
  });

  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: [{ role: "user", content: parts }],
    text: { format: { type: "json_object" } },
    temperature: 0.1,
  });

  const parsed = parseModelJsonResponse(extractTextFromResponse(response));
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
    reason: trimWs(parsed.reason) || "Visual audit failed.",
    repairHints: trimWsList(parsed.repair_hints, 8),
  };
}

// ---------------------------------------------------------------------------
// Wrapper: translateUserPromptInputs
// ---------------------------------------------------------------------------

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
    return { customPrompt: input.customPrompt };
  }

  const lines = [
    "You are a localization specialist for image-generation prompts.",
    `Translate the user's prompt content into the target output language ${input.language} for market ${input.country} and platform ${input.platform}.`,
    buildSimplifiedChineseOnlyLineLocal(input.language),
    "Rules:",
    "- Return JSON only.",
    "- Preserve the user's visual intent faithfully.",
    "- Keep the result concise and image-model friendly, but do not rewrite or optimize beyond translation and light normalization.",
    "- If the text is already appropriate for the target language, keep it with only light normalization.",
    "- Keep brand names, product names, units, model names, and proper nouns unchanged unless a natural localized form is clearly better.",
    "- Do not add new claims, details, or styling instructions that were not present in the source text.",
    `Prompt: ${input.customPrompt}`,
  ].filter(Boolean);

  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: lines.join("\n"),
    text: { format: { type: "json_object" } },
    temperature: 0.2,
  });

  try {
    const parsed = JSON.parse(extractTextFromResponse(response) || "{}") as { customPrompt?: string };
    return {
      customPrompt: hasPrompt ? parsed.customPrompt?.trim() || input.customPrompt.trim() : "",
    };
  } catch {
    return { customPrompt: input.customPrompt.trim() };
  }
}

// ---------------------------------------------------------------------------
// Wrapper: optimizeUserImagePrompt
// ---------------------------------------------------------------------------

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
  const preserveOriginalLanguage = !input.translateToOutputLanguage;
  const normalizedSizeInfo = normalizeSizeInfoToDualUnits(input.sizeInfo);
  const lines = [
    "You are an e-commerce image prompt optimizer.",
    preserveOriginalLanguage
      ? "Rewrite the user's image prompt into one strong plain-text prompt while preserving the user's original language. Use the market and platform context only as creative constraints, not as a translation instruction."
      : `Rewrite the user's image prompt into one strong plain-text prompt for ${input.platform} in ${input.language} for market ${input.country}.`,
    input.translateToOutputLanguage ? buildSimplifiedChineseOnlyLineLocal(input.language) : null,
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
    buildFactLine([
      ["Product name", input.productName],
      ["Brand", input.brandName],
      ["Category", input.category || null],
    ]),
    buildFactLine([["Selling points", input.sellingPoints]]),
    buildFactLine([["Additional notes", input.sourceDescription]]),
    buildFactLine([["Material information", input.materialInfo]]),
    buildFactLine([["Size and weight information", normalizedSizeInfo]]),
    buildRestrictionsLineLocal(input.restrictions),
    `Preferred image type: ${input.imageType}.`,
    `Target aspect ratio: ${input.ratio}. Resolution bucket: ${input.resolutionLabel}.`,
    normalizedSizeInfo
      ? "If measurements or weight appear anywhere in the optimized prompt, keep them in dual units and preserve the original primary system first."
      : null,
    `User prompt: ${input.customPrompt}`,
  ].filter(Boolean);

  const response = await createOpenAIResponse(input, {
    model: input.textModel,
    input: lines.join("\n"),
    temperature: 0.35,
  });

  return (extractTextFromResponse(response) || input.customPrompt).trim();
}
