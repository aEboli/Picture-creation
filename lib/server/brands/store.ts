import "server-only";

import { createBrand, deleteBrand, getBrandById, getBrandByName, listBrands, updateBrand } from "@/lib/db";
import type { BrandInput, BrandRecord } from "@/lib/types";

export function listBrandsByQuery(): BrandRecord[] {
  return listBrands();
}

export function getBrandRecordById(brandId: string): BrandRecord | null {
  return getBrandById(brandId);
}

export function getBrandRecordByName(name: string): BrandRecord | null {
  return getBrandByName(name);
}

export function createBrandRecord(input: BrandInput): BrandRecord {
  return createBrand(input);
}

export function updateBrandRecord(brandId: string, input: Partial<BrandInput>): BrandRecord | null {
  return updateBrand(brandId, input);
}

export function deleteBrandRecord(brandId: string): boolean {
  return deleteBrand(brandId);
}
