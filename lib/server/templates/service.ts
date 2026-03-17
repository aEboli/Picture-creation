import "server-only";

import { cache } from "react";

import type { TemplateFilters, TemplateInput, TemplateRecord } from "@/lib/types";

import {
  createTemplateRecord,
  deleteTemplateRecord,
  getTemplateRecordById,
  listTemplateCandidatesByScope,
  listTemplatesByFilters,
  resolveTemplateByScope,
  updateTemplateRecord,
} from "./store";

export class TemplateServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TemplateServiceError";
    this.status = status;
  }
}

export interface TemplateMatchRequestBody {
  category?: string;
  country?: string;
  imageTypes?: string[];
  language?: string;
  platform?: string;
}

const readTemplateRecord = cache((templateId: string) => getTemplateRecordById(templateId));

export function parseTemplateFilters(searchParams: URLSearchParams): TemplateFilters {
  return {
    search: searchParams.get("search") || undefined,
    country: searchParams.get("country") || undefined,
    language: searchParams.get("language") || undefined,
    platform: searchParams.get("platform") || undefined,
    category: searchParams.get("category") || undefined,
    imageType: searchParams.get("imageType") || undefined,
    source: (searchParams.get("source") as TemplateFilters["source"]) || undefined,
  };
}

export function listTemplatesForQuery(filters: TemplateFilters = {}): TemplateRecord[] {
  return listTemplatesByFilters(filters);
}

export function getTemplateOrThrow(templateId: string): TemplateRecord {
  const template = readTemplateRecord(templateId);
  if (!template) {
    throw new TemplateServiceError("Template not found.", 404);
  }

  return template;
}

export function createTemplateFromInput(input: Partial<TemplateInput> | null | undefined): TemplateRecord {
  validateTemplateInput(input ?? {});

  return createTemplateRecord({
    name: input!.name!.trim(),
    country: input!.country!.trim(),
    language: input!.language!.trim(),
    platform: input!.platform!.trim(),
    category: input!.category!.trim(),
    imageType: input!.imageType!.trim(),
    promptTemplate: input!.promptTemplate!.trim(),
    copyTemplate: input!.copyTemplate!.trim(),
    layoutStyle: input!.layoutStyle!.trim(),
    isDefault: false,
  });
}

export function updateTemplateById(templateId: string, input: Partial<TemplateInput> | null | undefined): TemplateRecord {
  const existing = getTemplateOrThrow(templateId);
  if (existing.isDefault) {
    throw new TemplateServiceError("Default templates are read-only. Duplicate them first.", 400);
  }

  const updated = updateTemplateRecord(templateId, normalizeTemplatePatch(input ?? {}));
  if (!updated) {
    throw new TemplateServiceError("Template not found.", 404);
  }

  return updated;
}

export function deleteTemplateById(templateId: string): { deleted: boolean } {
  const existing = getTemplateOrThrow(templateId);
  if (existing.isDefault) {
    throw new TemplateServiceError("Default templates cannot be deleted.", 400);
  }

  return { deleted: deleteTemplateRecord(templateId) };
}

export function matchTemplatesFromInput(body: TemplateMatchRequestBody | null | undefined) {
  if (
    !body?.country ||
    !body.language ||
    !body.platform ||
    !body.category ||
    !Array.isArray(body.imageTypes) ||
    body.imageTypes.some((imageType) => typeof imageType !== "string" || !imageType.trim())
  ) {
    throw new TemplateServiceError("Missing match fields.", 400);
  }

  return {
    matches: body.imageTypes.map((imageType) => ({
      imageType,
      template: resolveTemplateByScope({
        country: body.country!,
        language: body.language!,
        platform: body.platform!,
        category: body.category!,
        imageType,
      }),
      candidates: listTemplateCandidatesByScope({
        country: body.country!,
        language: body.language!,
        platform: body.platform!,
        category: body.category!,
        imageType,
      }),
    })),
  };
}

function validateTemplateInput(input: Partial<TemplateInput>) {
  const requiredFields: Array<keyof TemplateInput> = [
    "name",
    "country",
    "language",
    "platform",
    "category",
    "imageType",
    "promptTemplate",
    "copyTemplate",
    "layoutStyle",
  ];

  for (const field of requiredFields) {
    const value = input[field];
    if (typeof value !== "string" || !value.trim()) {
      throw new TemplateServiceError(`Field ${field} is required.`, 400);
    }
  }
}

function normalizeTemplatePatch(input: Partial<TemplateInput>): Partial<TemplateInput> {
  const patch: Partial<TemplateInput> = {};
  const stringFields: Array<keyof TemplateInput> = [
    "name",
    "country",
    "language",
    "platform",
    "category",
    "imageType",
    "promptTemplate",
    "copyTemplate",
    "layoutStyle",
  ];

  for (const field of stringFields) {
    const value = input[field];
    if (value !== undefined) {
      if (typeof value !== "string" || !value.trim()) {
        throw new TemplateServiceError(`Field ${field} must be a non-empty string.`, 400);
      }
      patch[field] = value.trim() as never;
    }
  }

  return patch;
}
