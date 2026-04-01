import "server-only";

import type { TemplateFilters, TemplateInput, TemplateRecord } from "@/lib/types";

const TEMPLATE_CENTER_RETIRED_MESSAGE = "Template center has been retired.";

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

function throwTemplateCenterRetired(): never {
  throw new TemplateServiceError(TEMPLATE_CENTER_RETIRED_MESSAGE, 410);
}

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

export function listTemplatesForQuery(_: TemplateFilters = {}): TemplateRecord[] {
  throwTemplateCenterRetired();
}

export function getTemplateOrThrow(_: string): TemplateRecord {
  throwTemplateCenterRetired();
}

export function createTemplateFromInput(_: Partial<TemplateInput> | null | undefined): TemplateRecord {
  throwTemplateCenterRetired();
}

export function updateTemplateById(_: string, __: Partial<TemplateInput> | null | undefined): TemplateRecord {
  throwTemplateCenterRetired();
}

export function deleteTemplateById(_: string): { deleted: boolean } {
  throwTemplateCenterRetired();
}

export function matchTemplatesFromInput(_: TemplateMatchRequestBody | null | undefined) {
  throwTemplateCenterRetired();
}
