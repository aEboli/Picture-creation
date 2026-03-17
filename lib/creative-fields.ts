const MATERIAL_PREFIX = "Material:";
const SIZE_PREFIX = "Size / dimensions:";

export interface SplitCreativeFields {
  sourceDescription: string;
  materialInfo: string;
  sizeInfo: string;
}

export function buildCompositeSourceDescription(input: {
  sourceDescription: string;
  materialInfo?: string;
  sizeInfo?: string;
}) {
  const blocks = [
    input.sourceDescription.trim(),
    input.materialInfo?.trim() ? `${MATERIAL_PREFIX} ${input.materialInfo.trim()}` : "",
    input.sizeInfo?.trim() ? `${SIZE_PREFIX} ${input.sizeInfo.trim()}` : "",
  ].filter(Boolean);

  return blocks.join("\n");
}

export function splitCompositeSourceDescription(rawValue?: string | null): SplitCreativeFields {
  const lines = (rawValue ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const sourceLines: string[] = [];
  const materialLines: string[] = [];
  const sizeLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(MATERIAL_PREFIX)) {
      materialLines.push(line.slice(MATERIAL_PREFIX.length).trim());
      continue;
    }

    if (line.startsWith(SIZE_PREFIX)) {
      sizeLines.push(line.slice(SIZE_PREFIX.length).trim());
      continue;
    }

    sourceLines.push(line);
  }

  return {
    sourceDescription: sourceLines.join("\n"),
    materialInfo: materialLines.join("\n"),
    sizeInfo: sizeLines.join("\n"),
  };
}
