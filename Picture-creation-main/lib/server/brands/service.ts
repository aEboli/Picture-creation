import "server-only";

import { cache } from "react";

import type { BrandInput, BrandRecord } from "@/lib/types";

import {
  createBrandRecord,
  deleteBrandRecord,
  getBrandRecordById,
  getBrandRecordByName,
  listBrandsByQuery,
  updateBrandRecord,
} from "./store";

const BRAND_FIELDS = ["name", "primaryColor", "tone", "bannedTerms", "promptGuidance"] as const;

export class BrandServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "BrandServiceError";
    this.status = status;
  }
}

const readBrandRecord = cache((brandId: string) => getBrandRecordById(brandId));

export function listBrandsForQuery(): BrandRecord[] {
  return listBrandsByQuery();
}

export function getBrandOrThrow(brandId: string): BrandRecord {
  const brand = readBrandRecord(brandId);
  if (!brand) {
    throw new BrandServiceError("Brand not found.", 404);
  }

  return brand;
}

export function createBrandFromInput(input: unknown): BrandRecord {
  const brandInput = normalizeBrandInput(input, true);
  if (getBrandRecordByName(brandInput.name)) {
    throw new BrandServiceError("Brand already exists.", 409);
  }

  return createBrandRecord(brandInput);
}

export function updateBrandById(brandId: string, input: unknown): BrandRecord {
  const existing = getBrandOrThrow(brandId);
  const patch = normalizeBrandInput(input, false);
  const nextName = typeof patch.name === "string" ? patch.name.trim() : existing.name;
  if (!nextName) {
    throw new BrandServiceError("Brand name is required.", 400);
  }

  const conflict = getBrandRecordByName(nextName);
  if (conflict && conflict.id !== brandId) {
    throw new BrandServiceError("Brand already exists.", 409);
  }

  const updated = updateBrandRecord(brandId, {
    ...patch,
    name: nextName,
  });
  if (!updated) {
    throw new BrandServiceError("Brand not found.", 404);
  }

  return updated;
}

export function deleteBrandById(brandId: string) {
  getBrandOrThrow(brandId);
  deleteBrandRecord(brandId);
}

function normalizeBrandInput(input: unknown, requireAllFields: true): BrandInput;
function normalizeBrandInput(input: unknown, requireAllFields: false): Partial<BrandInput>;
function normalizeBrandInput(input: unknown, requireAllFields: boolean): BrandInput | Partial<BrandInput> {
  if (!input || typeof input !== "object") {
    throw new BrandServiceError("Invalid brand input.", 400);
  }

  const value = input as Record<string, unknown>;
  const patch: Partial<BrandInput> = {};

  for (const field of BRAND_FIELDS) {
    const currentValue = value[field];
    if (currentValue === undefined) {
      if (requireAllFields) {
        throw new BrandServiceError("Invalid brand input.", 400);
      }
      continue;
    }

    if (typeof currentValue !== "string") {
      throw new BrandServiceError("Invalid brand input.", 400);
    }

    patch[field] = currentValue as never;
  }

  if (requireAllFields) {
    if (!patch.name?.trim()) {
      throw new BrandServiceError("Invalid brand input.", 400);
    }

    return {
      name: patch.name.trim(),
      primaryColor: patch.primaryColor ?? "",
      tone: patch.tone ?? "",
      bannedTerms: patch.bannedTerms ?? "",
      promptGuidance: patch.promptGuidance ?? "",
    };
  }

  if (patch.name !== undefined) {
    patch.name = patch.name.trim();
  }

  return patch;
}
