import "server-only";

import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  listTemplateCandidates,
  listTemplates,
  resolveTemplate,
  updateTemplate,
} from "@/lib/db";
import type { TemplateFilters, TemplateInput, TemplateRecord } from "@/lib/types";

export function listTemplatesByFilters(filters: TemplateFilters = {}): TemplateRecord[] {
  return listTemplates(filters);
}

export function getTemplateRecordById(templateId: string): TemplateRecord | null {
  return getTemplateById(templateId);
}

export function createTemplateRecord(input: TemplateInput): TemplateRecord {
  return createTemplate(input);
}

export function updateTemplateRecord(templateId: string, input: Partial<TemplateInput>): TemplateRecord | null {
  return updateTemplate(templateId, input);
}

export function deleteTemplateRecord(templateId: string): boolean {
  return deleteTemplate(templateId);
}

export function resolveTemplateByScope(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  imageType: string;
}): TemplateRecord | null {
  return resolveTemplate(input);
}

export function listTemplateCandidatesByScope(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  imageType: string;
}): TemplateRecord[] {
  return listTemplateCandidates(input);
}
