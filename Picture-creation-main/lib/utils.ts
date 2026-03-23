import { createHash, randomUUID } from "node:crypto";

export function toJson<T>(value: T): string {
  return JSON.stringify(value);
}

export function fromJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function parseRatio(value: string): [number, number] {
  const [left, right] = value.split(":").map(Number);
  return [left || 1, right || 1];
}

export function resolutionToPixels(label: string): number {
  switch (label) {
    case "0.5K":
    case "512px":
      return 512;
    case "1K":
      return 1024;
    case "2K":
      return 2048;
    case "4K":
      return 4096;
    default:
      return 1024;
  }
}

export function isGeminiImageSizeBucket(label: string): boolean {
  return label === "0.5K" || label === "1K" || label === "2K" || label === "4K" || label === "512px";
}

export function dimensionsForVariant(ratio: string, resolution: string): { width: number; height: number } {
  const [w, h] = parseRatio(ratio);
  const maxSize = resolutionToPixels(resolution);
  const maxBase = Math.max(w, h);
  const scale = maxSize / maxBase;
  return {
    width: Math.round(w * scale),
    height: Math.round(h * scale),
  };
}

export function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/jpeg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

export function detectImageDimensions(
  buffer: Buffer,
  mimeType?: string,
): { width: number; height: number } | null {
  const effectiveMimeType = mimeType?.toLowerCase() ?? "";

  if (effectiveMimeType === "image/png" || buffer.subarray(1, 4).toString("ascii") === "PNG") {
    if (buffer.length < 24) {
      return null;
    }
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  if (effectiveMimeType === "image/gif" || buffer.subarray(0, 3).toString("ascii") === "GIF") {
    if (buffer.length < 10) {
      return null;
    }
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  if (effectiveMimeType === "image/webp" || buffer.subarray(0, 4).toString("ascii") === "RIFF") {
    if (buffer.length < 30 || buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
      return null;
    }

    const chunkType = buffer.subarray(12, 16).toString("ascii");
    if (chunkType === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }

    if (chunkType === "VP8L") {
      const byte1 = buffer[21];
      const byte2 = buffer[22];
      const byte3 = buffer[23];
      const byte4 = buffer[24];
      return {
        width: 1 + (((byte2 & 0x3f) << 8) | byte1),
        height: 1 + (((byte4 & 0x0f) << 10) | (byte3 << 2) | ((byte2 & 0xc0) >> 6)),
      };
    }

    if (chunkType === "VP8 " && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }

    return null;
  }

  if (effectiveMimeType === "image/jpeg" || (buffer[0] === 0xff && buffer[1] === 0xd8)) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }

      const segmentLength = buffer.readUInt16BE(offset + 2);
      const isStartOfFrame =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isStartOfFrame) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }

      if (segmentLength < 2) {
        return null;
      }
      offset += 2 + segmentLength;
    }
  }

  return null;
}
