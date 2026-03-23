import type { CreationMode, GenerationSemantics } from "./types.ts";

function getMaxImagesPerPromptForModel(imageModel: string) {
  return imageModel.toLowerCase().includes("gemini-3") ? 14 : 3;
}

export function normalizeGenerationSemantics(value: unknown): GenerationSemantics {
  return value === "batch" ? "batch" : "joint";
}

export function getRequestInputGroupCount(input: {
  creationMode: CreationMode;
  generationSemantics: GenerationSemantics;
  sourceImageCount: number;
}) {
  if (input.sourceImageCount > 0) {
    return input.generationSemantics === "joint" ? 1 : input.sourceImageCount;
  }

  return input.creationMode === "prompt" ? 1 : 0;
}

export function getPlannedRequestCount(input: {
  creationMode: CreationMode;
  generationSemantics: GenerationSemantics;
  sourceImageCount: number;
  typeCount: number;
  ratioCount: number;
  resolutionCount: number;
  variantsPerType: number;
}) {
  return (
    getRequestInputGroupCount(input) *
    input.typeCount *
    input.ratioCount *
    input.resolutionCount *
    input.variantsPerType
  );
}

export function getRequestImageCount(input: {
  creationMode: CreationMode;
  generationSemantics: GenerationSemantics;
  sourceImageCount: number;
  referenceImageCount: number;
}) {
  const sourceImageCountPerRequest =
    input.sourceImageCount > 0 ? (input.generationSemantics === "joint" ? input.sourceImageCount : 1) : 0;

  return sourceImageCountPerRequest + input.referenceImageCount;
}

export function getMaxSourceImagesForSelection(
  imageModel: string,
  input: {
    generationSemantics: GenerationSemantics;
    referenceImageCount: number;
  },
) {
  if (input.generationSemantics === "batch") {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, getMaxImagesPerPromptForModel(imageModel) - Math.max(0, input.referenceImageCount));
}

export function getMaxReferenceImagesForSelection(
  imageModel: string,
  input: {
    generationSemantics: GenerationSemantics;
    sourceImageCount: number;
  },
) {
  if (input.generationSemantics === "batch") {
    return Math.max(0, getMaxImagesPerPromptForModel(imageModel) - 1);
  }

  return Math.max(0, getMaxImagesPerPromptForModel(imageModel) - Math.max(0, input.sourceImageCount));
}
