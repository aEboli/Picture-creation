import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { DEFAULT_DATABASE_PATH, DEFAULT_SETTINGS } from "@/lib/server-config";
import type {
  AppSettings,
  AssetRecord,
  BrandInput,
  BrandRecord,
  CreateJobInput,
  GeneratedCopyBundle,
  JobDetails,
  JobItemRecord,
  JobItemReviewStatus,
  JobRecord,
  JobStatus,
  LocalizedCreativeInputs,
  MarketingImageStrategy,
  MarketingStrategy,
  ProviderDebugInfo,
  VisualAudit,
  ReferenceLayoutAnalysis,
  ReferencePosterCopy,
  TemplateFilters,
  TemplateInput,
  TemplateRecord,
  JobPreviewAsset,
  UiLanguage,
} from "@/lib/types";
import { createId, detectImageDimensions, fromJson, mimeToExtension, nowIso, toJson } from "@/lib/utils";

declare global {
  var commerceStudioDb: DatabaseSync | undefined;
}

export interface DashboardStats {
  jobs: number;
  assets: number;
  templates: number;
  markets: number;
}

export interface JobListFilters {
  search?: string;
  status?: string;
  platform?: string;
  country?: string;
  language?: string;
  imageType?: string;
  resolution?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface JobListSummary {
  totalJobs: number;
  totalGenerated: number;
  totalSucceeded: number;
  totalFailed: number;
}

function rowToJob(row: any): JobRecord {
  return {
    id: row.id,
    status: row.status,
    creationMode: row.creation_mode ?? "standard",
    generationSemantics: row.generation_semantics ?? "batch",
    strategyWorkflowMode: row.strategy_workflow_mode ?? "quick",
    referenceRemakeGoal: row.reference_remake_goal ?? "hard-remake",
    referenceStrength: row.reference_strength ?? "balanced",
    referenceCompositionLock: row.reference_composition_lock ?? "balanced",
    referenceTextRegionPolicy: row.reference_text_region_policy ?? "preserve",
    referenceBackgroundMode: row.reference_background_mode ?? "preserve",
    preserveReferenceText: Boolean(row.preserve_reference_text ?? 1),
    referenceCopyMode: row.reference_copy_mode ?? "reference",
    generatedCount: Number(row.generated_count ?? 0),
    succeededCount: Number(row.succeeded_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    productName: row.product_name,
    sku: row.sku,
    category: row.category,
    brandName: row.brand_name,
    sellingPoints: row.selling_points,
    restrictions: row.restrictions,
    customPrompt: row.custom_prompt ?? "",
    promptInputs: fromJson(row.prompt_inputs_json, [row.custom_prompt ?? ""]),
    customNegativePrompt: row.custom_negative_prompt ?? "",
    translatePromptToOutputLanguage: Boolean(row.translate_prompt_to_output_language ?? 0),
    autoOptimizePrompt: Boolean(row.auto_optimize_prompt ?? 0),
    referenceExtraPrompt: row.reference_extra_prompt ?? "",
    referenceNegativePrompt: row.reference_negative_prompt ?? "",
    country: row.country,
    language: row.language,
    platform: row.platform,
    selectedTypes: fromJson(row.selected_types, []),
    selectedRatios: fromJson(row.selected_ratios, []),
    selectedResolutions: fromJson(row.selected_resolutions, []),
    variantsPerType: row.variants_per_type,
    includeCopyLayout: Boolean(row.include_copy_layout),
    batchFileCount: row.batch_file_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    sourceDescription: row.source_description,
    uiLanguage: row.ui_language,
    selectedTemplateOverrides: fromJson(row.selected_template_overrides, {}),
    marketingStrategy: fromJson<MarketingStrategy | null>(row.marketing_strategy_json, null),
    localizedInputs: fromJson<LocalizedCreativeInputs | null>(row.localized_inputs_json, null),
    referenceLayoutOverride: fromJson<ReferenceLayoutAnalysis | null>(row.reference_layout_override_json, null),
    referencePosterCopyOverride: fromJson<ReferencePosterCopy | null>(row.reference_poster_copy_override_json, null),
    referenceLayoutAnalysis: fromJson<ReferenceLayoutAnalysis | null>(row.reference_layout_analysis_json, null),
    referencePosterCopy: fromJson<ReferencePosterCopy | null>(row.reference_poster_copy_json, null),
    feishuRecordId: row.feishu_record_id ?? null,
    feishuFileTokens: fromJson<string[]>(row.feishu_file_tokens_json, []),
    previewAssets: [],
    previewImageCount: 0,
  };
}

const JOB_LIST_SELECT = `
  SELECT
    jobs.*,
    COALESCE(job_stats.generated_count, 0) AS generated_count,
    COALESCE(job_stats.succeeded_count, 0) AS succeeded_count,
    COALESCE(job_stats.failed_count, 0) AS failed_count
  FROM jobs
  LEFT JOIN (
    SELECT
      job_id,
      COUNT(*) AS generated_count,
      SUM(CASE WHEN generated_asset_id IS NOT NULL THEN 1 ELSE 0 END) AS succeeded_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
    FROM job_items
    GROUP BY job_id
  ) AS job_stats
    ON job_stats.job_id = jobs.id
`;

function rowToItem(row: any): JobItemRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    sourceAssetId: row.source_asset_id,
    sourceAssetName: row.source_asset_name,
    imageType: row.image_type,
    ratio: row.ratio,
    resolutionLabel: row.resolution_label,
    width: row.width,
    height: row.height,
    variantIndex: row.variant_index,
    promptInputIndex: row.prompt_input_index ?? 0,
    imageStrategy: fromJson<MarketingImageStrategy | null>(row.image_strategy_json, null),
    strategyEdited: Boolean(row.strategy_edited ?? 0),
    visualAudit: fromJson<VisualAudit | null>(row.visual_audit_json, null),
    generationAttempt: Number(row.generation_attempt ?? 0),
    autoRetriedFromAudit: Boolean(row.auto_retried_from_audit ?? 0),
    status: row.status,
    promptText: row.prompt_text,
    negativePrompt: row.negative_prompt,
    copyJson: row.copy_json,
    generatedAssetId: row.generated_asset_id,
    layoutAssetId: row.layout_asset_id,
    reviewStatus: row.review_status ?? "unreviewed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    errorMessage: row.error_message,
    warningMessage: row.warning_message ?? null,
    providerDebug: fromJson<ProviderDebugInfo | null>(row.provider_debug_json, null),
  };
}

function rowToAsset(row: any): AssetRecord {
  return {
    id: row.id,
    jobId: row.job_id,
    jobItemId: row.job_item_id,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    filePath: row.file_path,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    createdAt: row.created_at,
  };
}

function rowToJobPreviewAsset(row: any): JobPreviewAsset {
  return {
    id: row.id,
    jobItemId: row.job_item_id,
    imageType: row.image_type,
    ratio: row.ratio,
    resolutionLabel: row.resolution_label,
    originalName: row.original_name,
    width: row.width ?? null,
    height: row.height ?? null,
  };
}

function buildJobListWhere(filters: JobListFilters = {}) {
  const clauses: string[] = [];
  const values: Array<string> = [];

  if (filters.search) {
    clauses.push("(product_name LIKE ? OR sku LIKE ?)");
    values.push(`%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.status) {
    clauses.push("status = ?");
    values.push(filters.status);
  }
  if (filters.platform) {
    clauses.push("platform = ?");
    values.push(filters.platform);
  }
  if (filters.country) {
    clauses.push("country = ?");
    values.push(filters.country);
  }
  if (filters.language) {
    clauses.push("language = ?");
    values.push(filters.language);
  }
  if (filters.imageType) {
    clauses.push("selected_types LIKE ?");
    values.push(`%${filters.imageType}%`);
  }
  if (filters.resolution) {
    clauses.push("selected_resolutions LIKE ?");
    values.push(`%${filters.resolution}%`);
  }
  if (filters.dateFrom) {
    clauses.push("created_at >= ?");
    values.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push("created_at <= ?");
    values.push(filters.dateTo);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

function attachJobPreviewAssets(jobs: JobRecord[]): JobRecord[] {
  if (!jobs.length) {
    return jobs;
  }

  const database = getDb();
  const placeholders = jobs.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `SELECT
        preview.job_id,
        preview.total_count,
        preview.job_item_id,
        preview.image_type,
        preview.ratio,
        preview.resolution_label,
        assets.id,
        assets.original_name,
        assets.width,
        assets.height
      FROM (
        SELECT
          job_id,
          id AS job_item_id,
          image_type,
          ratio,
          resolution_label,
          generated_asset_id,
          ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at ASC) AS row_number,
          COUNT(*) OVER (PARTITION BY job_id) AS total_count
        FROM job_items
        WHERE generated_asset_id IS NOT NULL
          AND job_id IN (${placeholders})
      ) AS preview
      INNER JOIN assets
        ON assets.id = preview.generated_asset_id
      WHERE preview.row_number <= 8
      ORDER BY preview.job_id ASC, preview.row_number ASC`,
    )
    .all(...jobs.map((job) => job.id)) as Array<any>;

  const previewMap = new Map<string, { assets: JobPreviewAsset[]; totalCount: number }>();

  for (const row of rows) {
    const current = previewMap.get(row.job_id) ?? { assets: [], totalCount: 0 };
    current.assets.push(rowToJobPreviewAsset(row));
    current.totalCount = Number(row.total_count ?? current.assets.length);
    previewMap.set(row.job_id, current);
  }

  return jobs.map((job) => {
    const preview = previewMap.get(job.id);
    return {
      ...job,
      previewAssets: preview?.assets ?? [],
      previewImageCount: preview?.totalCount ?? 0,
    };
  });
}

function ensureActualAssetDimensions(asset: AssetRecord): AssetRecord {
  if (asset.mimeType === "image/svg+xml" || !asset.filePath) {
    return asset;
  }

  const extension = mimeToExtension(asset.mimeType);
  const expectedSuffix = extension ? `.${extension}` : "";
  const currentExtension = path.extname(asset.filePath).toLowerCase();
  const filePathCandidates = !expectedSuffix
    ? [asset.filePath]
    : !currentExtension
      ? [asset.filePath, `${asset.filePath}${expectedSuffix}`]
      : currentExtension === expectedSuffix
        ? [asset.filePath, asset.filePath.slice(0, -expectedSuffix.length)]
        : [asset.filePath, `${asset.filePath}${expectedSuffix}`];
  const resolvedFilePath = filePathCandidates.find((candidate) => fs.existsSync(candidate));

  if (!resolvedFilePath) {
    return asset;
  }

  try {
    const buffer = fs.readFileSync(resolvedFilePath);
    const detected = detectImageDimensions(buffer, asset.mimeType);
    if (!detected) {
      return asset;
    }

    if (asset.width === detected.width && asset.height === detected.height) {
      return asset;
    }

    getDb().prepare("UPDATE assets SET width = ?, height = ? WHERE id = ?").run(detected.width, detected.height, asset.id);
    return {
      ...asset,
      width: detected.width,
      height: detected.height,
    };
  } catch {
    return asset;
  }
}

function rowToTemplate(row: any): TemplateRecord {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    language: row.language,
    platform: row.platform,
    category: row.category,
    imageType: row.image_type,
    promptTemplate: row.prompt_template,
    copyTemplate: row.copy_template,
    layoutStyle: row.layout_style,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToBrand(row: any): BrandRecord {
  return {
    id: row.id,
    name: row.name,
    primaryColor: row.primary_color,
    tone: row.tone,
    bannedTerms: row.banned_terms,
    promptGuidance: row.prompt_guidance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureSettingsColumns(database: DatabaseSync) {
  const existingColumns = new Set(
    (database.prepare("PRAGMA table_info(settings)").all() as Array<{ name: string }>).map((column) => column.name),
  );

  const columnDefinitions = [
    {
      name: "default_api_base_url",
      statement: "ALTER TABLE settings ADD COLUMN default_api_base_url TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "default_api_version",
      statement: "ALTER TABLE settings ADD COLUMN default_api_version TEXT NOT NULL DEFAULT 'v1beta'",
    },
    {
      name: "default_api_headers",
      statement: "ALTER TABLE settings ADD COLUMN default_api_headers TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "feishu_sync_enabled",
      statement: "ALTER TABLE settings ADD COLUMN feishu_sync_enabled INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "feishu_app_id",
      statement: "ALTER TABLE settings ADD COLUMN feishu_app_id TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "feishu_app_secret",
      statement: "ALTER TABLE settings ADD COLUMN feishu_app_secret TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "feishu_bitable_app_token",
      statement: "ALTER TABLE settings ADD COLUMN feishu_bitable_app_token TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "feishu_bitable_table_id",
      statement: "ALTER TABLE settings ADD COLUMN feishu_bitable_table_id TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "feishu_upload_parent_type",
      statement: "ALTER TABLE settings ADD COLUMN feishu_upload_parent_type TEXT NOT NULL DEFAULT 'bitable_image'",
    },
    {
      name: "feishu_field_mapping_json",
      statement: "ALTER TABLE settings ADD COLUMN feishu_field_mapping_json TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "templates_retired",
      statement: "ALTER TABLE settings ADD COLUMN templates_retired INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "agent_settings_json",
      statement: "ALTER TABLE settings ADD COLUMN agent_settings_json TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "default_provider",
      statement: "ALTER TABLE settings ADD COLUMN default_provider TEXT NOT NULL DEFAULT 'gemini'",
    },
    {
      name: "image_type_prompt_overrides_json",
      statement: "ALTER TABLE settings ADD COLUMN image_type_prompt_overrides_json TEXT NOT NULL DEFAULT '{}'",
    },
  ];

  for (const column of columnDefinitions) {
    if (!existingColumns.has(column.name)) {
      database.exec(column.statement);
    }
  }
}

function ensureJobItemColumns(database: DatabaseSync) {
  const existingColumns = new Set(
    (database.prepare("PRAGMA table_info(job_items)").all() as Array<{ name: string }>).map((column) => column.name),
  );

  const columnDefinitions = [
    {
      name: "prompt_input_index",
      statement: "ALTER TABLE job_items ADD COLUMN prompt_input_index INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "image_strategy_json",
      statement: "ALTER TABLE job_items ADD COLUMN image_strategy_json TEXT",
    },
    {
      name: "strategy_edited",
      statement: "ALTER TABLE job_items ADD COLUMN strategy_edited INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "visual_audit_json",
      statement: "ALTER TABLE job_items ADD COLUMN visual_audit_json TEXT",
    },
    {
      name: "generation_attempt",
      statement: "ALTER TABLE job_items ADD COLUMN generation_attempt INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "auto_retried_from_audit",
      statement: "ALTER TABLE job_items ADD COLUMN auto_retried_from_audit INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "review_status",
      statement: "ALTER TABLE job_items ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed'",
    },
    {
      name: "warning_message",
      statement: "ALTER TABLE job_items ADD COLUMN warning_message TEXT",
    },
    {
      name: "provider_debug_json",
      statement: "ALTER TABLE job_items ADD COLUMN provider_debug_json TEXT",
    },
  ];

  for (const column of columnDefinitions) {
    if (!existingColumns.has(column.name)) {
      database.exec(column.statement);
    }
  }
}

function ensureJobColumns(database: DatabaseSync) {
  const existingColumns = new Set(
    (database.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>).map((column) => column.name),
  );

  const columnDefinitions = [
    {
      name: "creation_mode",
      statement: "ALTER TABLE jobs ADD COLUMN creation_mode TEXT NOT NULL DEFAULT 'standard'",
    },
    {
      name: "generation_semantics",
      statement: "ALTER TABLE jobs ADD COLUMN generation_semantics TEXT NOT NULL DEFAULT 'batch'",
    },
    {
      name: "reference_remake_goal",
      statement: "ALTER TABLE jobs ADD COLUMN reference_remake_goal TEXT NOT NULL DEFAULT 'hard-remake'",
    },
    {
      name: "reference_strength",
      statement: "ALTER TABLE jobs ADD COLUMN reference_strength TEXT NOT NULL DEFAULT 'balanced'",
    },
    {
      name: "reference_composition_lock",
      statement: "ALTER TABLE jobs ADD COLUMN reference_composition_lock TEXT NOT NULL DEFAULT 'balanced'",
    },
    {
      name: "reference_text_region_policy",
      statement: "ALTER TABLE jobs ADD COLUMN reference_text_region_policy TEXT NOT NULL DEFAULT 'preserve'",
    },
    {
      name: "reference_background_mode",
      statement: "ALTER TABLE jobs ADD COLUMN reference_background_mode TEXT NOT NULL DEFAULT 'preserve'",
    },
    {
      name: "preserve_reference_text",
      statement: "ALTER TABLE jobs ADD COLUMN preserve_reference_text INTEGER NOT NULL DEFAULT 1",
    },
    {
      name: "reference_copy_mode",
      statement: "ALTER TABLE jobs ADD COLUMN reference_copy_mode TEXT NOT NULL DEFAULT 'reference'",
    },
    {
      name: "strategy_workflow_mode",
      statement: "ALTER TABLE jobs ADD COLUMN strategy_workflow_mode TEXT NOT NULL DEFAULT 'quick'",
    },
    {
      name: "custom_prompt",
      statement: "ALTER TABLE jobs ADD COLUMN custom_prompt TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "prompt_inputs_json",
      statement: "ALTER TABLE jobs ADD COLUMN prompt_inputs_json TEXT NOT NULL DEFAULT '[]'",
    },
    {
      name: "translate_prompt_to_output_language",
      statement: "ALTER TABLE jobs ADD COLUMN translate_prompt_to_output_language INTEGER NOT NULL DEFAULT 1",
    },
    {
      name: "auto_optimize_prompt",
      statement: "ALTER TABLE jobs ADD COLUMN auto_optimize_prompt INTEGER NOT NULL DEFAULT 0",
    },
    {
      name: "custom_negative_prompt",
      statement: "ALTER TABLE jobs ADD COLUMN custom_negative_prompt TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "reference_extra_prompt",
      statement: "ALTER TABLE jobs ADD COLUMN reference_extra_prompt TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "reference_negative_prompt",
      statement: "ALTER TABLE jobs ADD COLUMN reference_negative_prompt TEXT NOT NULL DEFAULT ''",
    },
    {
      name: "selected_template_overrides",
      statement: "ALTER TABLE jobs ADD COLUMN selected_template_overrides TEXT NOT NULL DEFAULT '{}'",
    },
    {
      name: "marketing_strategy_json",
      statement: "ALTER TABLE jobs ADD COLUMN marketing_strategy_json TEXT",
    },
    {
      name: "localized_inputs_json",
      statement: "ALTER TABLE jobs ADD COLUMN localized_inputs_json TEXT",
    },
    {
      name: "reference_layout_override_json",
      statement: "ALTER TABLE jobs ADD COLUMN reference_layout_override_json TEXT",
    },
    {
      name: "reference_poster_copy_override_json",
      statement: "ALTER TABLE jobs ADD COLUMN reference_poster_copy_override_json TEXT",
    },
    {
      name: "reference_layout_analysis_json",
      statement: "ALTER TABLE jobs ADD COLUMN reference_layout_analysis_json TEXT",
    },
    {
      name: "reference_poster_copy_json",
      statement: "ALTER TABLE jobs ADD COLUMN reference_poster_copy_json TEXT",
    },
    {
      name: "feishu_record_id",
      statement: "ALTER TABLE jobs ADD COLUMN feishu_record_id TEXT",
    },
    {
      name: "feishu_file_tokens_json",
      statement: "ALTER TABLE jobs ADD COLUMN feishu_file_tokens_json TEXT NOT NULL DEFAULT '[]'",
    },
  ];

  for (const column of columnDefinitions) {
    if (!existingColumns.has(column.name)) {
      database.exec(column.statement);
    }
  }
}

function ensureSchema(database: DatabaseSync) {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      default_api_key TEXT NOT NULL DEFAULT '',
      default_text_model TEXT NOT NULL,
      default_image_model TEXT NOT NULL,
      default_api_base_url TEXT NOT NULL DEFAULT '',
      default_api_version TEXT NOT NULL DEFAULT 'v1beta',
      default_api_headers TEXT NOT NULL DEFAULT '',
      storage_dir TEXT NOT NULL,
      max_concurrency INTEGER NOT NULL DEFAULT 2,
      default_ui_language TEXT NOT NULL DEFAULT 'zh',
      feishu_sync_enabled INTEGER NOT NULL DEFAULT 0,
      feishu_app_id TEXT NOT NULL DEFAULT '',
      feishu_app_secret TEXT NOT NULL DEFAULT '',
      feishu_bitable_app_token TEXT NOT NULL DEFAULT '',
      feishu_bitable_table_id TEXT NOT NULL DEFAULT '',
      feishu_upload_parent_type TEXT NOT NULL DEFAULT 'bitable_image',
      feishu_field_mapping_json TEXT NOT NULL DEFAULT '{}',
      agent_settings_json TEXT NOT NULL DEFAULT '{}',
      image_type_prompt_overrides_json TEXT NOT NULL DEFAULT '{}',
      templates_retired INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      creation_mode TEXT NOT NULL DEFAULT 'standard',
      generation_semantics TEXT NOT NULL DEFAULT 'batch',
      strategy_workflow_mode TEXT NOT NULL DEFAULT 'quick',
      reference_remake_goal TEXT NOT NULL DEFAULT 'hard-remake',
      reference_strength TEXT NOT NULL DEFAULT 'balanced',
      reference_composition_lock TEXT NOT NULL DEFAULT 'balanced',
      reference_text_region_policy TEXT NOT NULL DEFAULT 'preserve',
      reference_background_mode TEXT NOT NULL DEFAULT 'preserve',
      preserve_reference_text INTEGER NOT NULL DEFAULT 1,
      reference_copy_mode TEXT NOT NULL DEFAULT 'reference',
      product_name TEXT NOT NULL,
      sku TEXT NOT NULL,
      category TEXT NOT NULL,
      brand_name TEXT NOT NULL,
      selling_points TEXT NOT NULL,
      restrictions TEXT NOT NULL,
      custom_prompt TEXT NOT NULL DEFAULT '',
      prompt_inputs_json TEXT NOT NULL DEFAULT '[]',
      custom_negative_prompt TEXT NOT NULL DEFAULT '',
      translate_prompt_to_output_language INTEGER NOT NULL DEFAULT 1,
      auto_optimize_prompt INTEGER NOT NULL DEFAULT 0,
      reference_extra_prompt TEXT NOT NULL DEFAULT '',
      reference_negative_prompt TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL,
      language TEXT NOT NULL,
      platform TEXT NOT NULL,
      selected_types TEXT NOT NULL,
      selected_ratios TEXT NOT NULL,
      selected_resolutions TEXT NOT NULL,
      variants_per_type INTEGER NOT NULL,
      include_copy_layout INTEGER NOT NULL DEFAULT 0,
      batch_file_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      error_message TEXT,
      source_description TEXT NOT NULL,
      ui_language TEXT NOT NULL,
      selected_template_overrides TEXT NOT NULL DEFAULT '{}',
      marketing_strategy_json TEXT,
      localized_inputs_json TEXT,
      reference_layout_override_json TEXT,
      reference_poster_copy_override_json TEXT,
      reference_layout_analysis_json TEXT,
      reference_poster_copy_json TEXT,
      feishu_record_id TEXT,
      feishu_file_tokens_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS job_items (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      source_asset_id TEXT NOT NULL,
      source_asset_name TEXT NOT NULL,
      image_type TEXT NOT NULL,
      ratio TEXT NOT NULL,
      resolution_label TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      variant_index INTEGER NOT NULL,
      prompt_input_index INTEGER NOT NULL DEFAULT 0,
      image_strategy_json TEXT,
      strategy_edited INTEGER NOT NULL DEFAULT 0,
      visual_audit_json TEXT,
      generation_attempt INTEGER NOT NULL DEFAULT 0,
      auto_retried_from_audit INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      prompt_text TEXT,
      negative_prompt TEXT,
      copy_json TEXT,
      generated_asset_id TEXT,
      layout_asset_id TEXT,
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      warning_message TEXT,
      provider_debug_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      job_item_id TEXT REFERENCES job_items(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_path TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      language TEXT NOT NULL,
      platform TEXT NOT NULL,
      category TEXT NOT NULL,
      image_type TEXT NOT NULL,
      prompt_template TEXT NOT NULL,
      copy_template TEXT NOT NULL,
      layout_style TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      primary_color TEXT NOT NULL,
      tone TEXT NOT NULL,
      banned_terms TEXT NOT NULL,
      prompt_guidance TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_platform ON jobs(platform);
    CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
    CREATE INDEX IF NOT EXISTS idx_assets_job_id ON assets(job_id);
    CREATE INDEX IF NOT EXISTS idx_brands_name ON brands(name);
  `);

  ensureSettingsColumns(database);
  ensureJobColumns(database);
  ensureJobItemColumns(database);

  const existingSettings = database.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
  if (existingSettings.count === 0) {
    const now = nowIso();
    database
      .prepare(
        `INSERT INTO settings (
          id, default_api_key, default_text_model, default_image_model, default_api_base_url, default_api_version, default_api_headers, storage_dir, max_concurrency, default_ui_language,
          feishu_sync_enabled, feishu_app_id, feishu_app_secret, feishu_bitable_app_token, feishu_bitable_table_id, feishu_upload_parent_type, feishu_field_mapping_json, agent_settings_json, templates_retired,
          created_at, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        DEFAULT_SETTINGS.defaultApiKey,
        DEFAULT_SETTINGS.defaultTextModel,
        DEFAULT_SETTINGS.defaultImageModel,
        DEFAULT_SETTINGS.defaultApiBaseUrl,
        DEFAULT_SETTINGS.defaultApiVersion,
        DEFAULT_SETTINGS.defaultApiHeaders,
        DEFAULT_SETTINGS.storageDir,
        DEFAULT_SETTINGS.maxConcurrency,
        DEFAULT_SETTINGS.defaultUiLanguage,
        DEFAULT_SETTINGS.feishuSyncEnabled ? 1 : 0,
        DEFAULT_SETTINGS.feishuAppId,
        DEFAULT_SETTINGS.feishuAppSecret,
        DEFAULT_SETTINGS.feishuBitableAppToken,
        DEFAULT_SETTINGS.feishuBitableTableId,
        DEFAULT_SETTINGS.feishuUploadParentType,
        DEFAULT_SETTINGS.feishuFieldMappingJson,
        DEFAULT_SETTINGS.agentSettingsJson,
        0,
        now,
        now,
      );
  }

  migrateLegacyDefaultModels(database);

  retireLegacyTemplates(database);
}

function migrateLegacyDefaultModels(database: DatabaseSync) {
  const row = database
    .prepare("SELECT default_text_model, default_image_model FROM settings WHERE id = 1")
    .get() as { default_text_model?: string | null; default_image_model?: string | null } | undefined;

  if (!row) {
    return;
  }

  if (row.default_text_model !== "gemini-2.5-flash" || row.default_image_model !== "gemini-2.5-flash-image") {
    return;
  }

  database
    .prepare(
      `UPDATE settings SET
        default_text_model = ?,
        default_image_model = ?,
        updated_at = ?
      WHERE id = 1`,
    )
    .run("gemini-3.1-flash-lite-preview", "gemini-3.1-flash-image-preview", nowIso());
}

function retireLegacyTemplates(database: DatabaseSync) {
  const settingsRow = database.prepare("SELECT templates_retired FROM settings WHERE id = 1").get() as
    | { templates_retired?: number | null }
    | undefined;

  if ((settingsRow?.templates_retired ?? 0) === 1) {
    return;
  }

  database.prepare("DELETE FROM templates").run();
  database.prepare("UPDATE settings SET templates_retired = 1, updated_at = ? WHERE id = 1").run(nowIso());
}

export function getDb(): DatabaseSync {
  if (!globalThis.commerceStudioDb) {
    const databaseDir = path.dirname(DEFAULT_DATABASE_PATH);
    fs.mkdirSync(databaseDir, { recursive: true });
    globalThis.commerceStudioDb = new DatabaseSync(DEFAULT_DATABASE_PATH);
    ensureSchema(globalThis.commerceStudioDb);
  }

  return globalThis.commerceStudioDb;
}

export function getSettings(): AppSettings {
  const database = getDb();
  const row = database.prepare("SELECT * FROM settings WHERE id = 1").get() as any;
  return {
    defaultApiKey: row.default_api_key,
    defaultTextModel: row.default_text_model,
    defaultImageModel: row.default_image_model,
    defaultApiBaseUrl: row.default_api_base_url ?? "",
    defaultApiVersion: row.default_api_version ?? "v1beta",
    defaultApiHeaders: row.default_api_headers ?? "",
    defaultProvider: row.default_provider ?? "gemini",
    storageDir: row.storage_dir,
    maxConcurrency: row.max_concurrency,
    defaultUiLanguage: row.default_ui_language,
    feishuSyncEnabled: Boolean(row.feishu_sync_enabled ?? 0),
    feishuAppId: row.feishu_app_id ?? "",
    feishuAppSecret: row.feishu_app_secret ?? "",
    feishuBitableAppToken: row.feishu_bitable_app_token ?? "",
    feishuBitableTableId: row.feishu_bitable_table_id ?? "",
    feishuUploadParentType: row.feishu_upload_parent_type ?? "bitable_image",
    feishuFieldMappingJson: row.feishu_field_mapping_json ?? "{}",
    agentSettingsJson: row.agent_settings_json ?? "{}",
    imageTypePromptOverridesJson: row.image_type_prompt_overrides_json ?? "{}",
  };
}

export function updateSettings(input: Partial<AppSettings>): AppSettings {
  const database = getDb();
  const settings = getSettings();
  const nextSettings: AppSettings = {
    defaultApiKey: input.defaultApiKey ?? settings.defaultApiKey,
    defaultTextModel: input.defaultTextModel ?? settings.defaultTextModel,
    defaultImageModel: input.defaultImageModel ?? settings.defaultImageModel,
    defaultApiBaseUrl: input.defaultApiBaseUrl ?? settings.defaultApiBaseUrl,
    defaultApiVersion: input.defaultApiVersion ?? settings.defaultApiVersion,
    defaultApiHeaders: input.defaultApiHeaders ?? settings.defaultApiHeaders,
    defaultProvider: input.defaultProvider ?? settings.defaultProvider,
    storageDir: input.storageDir ?? settings.storageDir,
    maxConcurrency: input.maxConcurrency ?? settings.maxConcurrency,
    defaultUiLanguage: input.defaultUiLanguage ?? settings.defaultUiLanguage,
    feishuSyncEnabled: input.feishuSyncEnabled ?? settings.feishuSyncEnabled,
    feishuAppId: input.feishuAppId ?? settings.feishuAppId,
    feishuAppSecret: input.feishuAppSecret ?? settings.feishuAppSecret,
    feishuBitableAppToken: input.feishuBitableAppToken ?? settings.feishuBitableAppToken,
    feishuBitableTableId: input.feishuBitableTableId ?? settings.feishuBitableTableId,
    feishuUploadParentType: input.feishuUploadParentType ?? settings.feishuUploadParentType,
    feishuFieldMappingJson: input.feishuFieldMappingJson ?? settings.feishuFieldMappingJson,
    agentSettingsJson: input.agentSettingsJson ?? settings.agentSettingsJson,
    imageTypePromptOverridesJson: input.imageTypePromptOverridesJson ?? settings.imageTypePromptOverridesJson,
  };

  database
    .prepare(
      `UPDATE settings SET
        default_api_key = ?,
        default_text_model = ?,
        default_image_model = ?,
        default_api_base_url = ?,
        default_api_version = ?,
        default_api_headers = ?,
        default_provider = ?,
        storage_dir = ?,
        max_concurrency = ?,
        default_ui_language = ?,
        feishu_sync_enabled = ?,
        feishu_app_id = ?,
        feishu_app_secret = ?,
        feishu_bitable_app_token = ?,
        feishu_bitable_table_id = ?,
        feishu_upload_parent_type = ?,
        feishu_field_mapping_json = ?,
        agent_settings_json = ?,
        image_type_prompt_overrides_json = ?,
        updated_at = ?
      WHERE id = 1`
    )
    .run(
      nextSettings.defaultApiKey,
      nextSettings.defaultTextModel,
      nextSettings.defaultImageModel,
      nextSettings.defaultApiBaseUrl,
      nextSettings.defaultApiVersion,
      nextSettings.defaultApiHeaders,
      nextSettings.defaultProvider,
      nextSettings.storageDir,
      nextSettings.maxConcurrency,
      nextSettings.defaultUiLanguage,
      nextSettings.feishuSyncEnabled ? 1 : 0,
      nextSettings.feishuAppId,
      nextSettings.feishuAppSecret,
      nextSettings.feishuBitableAppToken,
      nextSettings.feishuBitableTableId,
      nextSettings.feishuUploadParentType,
      nextSettings.feishuFieldMappingJson,
      nextSettings.agentSettingsJson,
      nextSettings.imageTypePromptOverridesJson,
      nowIso(),
    );

  return nextSettings;
}

export function getDashboardStats(): DashboardStats {
  const database = getDb();
  const jobs = database.prepare("SELECT COUNT(*) as count FROM jobs").get() as { count: number };
  const assets = database.prepare("SELECT COUNT(*) as count FROM assets WHERE kind = 'generated'").get() as { count: number };
  const templates = database.prepare("SELECT COUNT(*) as count FROM templates").get() as { count: number };
  return {
    jobs: jobs.count,
    assets: assets.count,
    templates: templates.count,
    markets: 10,
  };
}

function matchesTemplateScope(templateValue: string, targetValue: string) {
  return templateValue === "*" || templateValue === targetValue;
}

function scoreTemplateMatch(template: TemplateRecord, input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  imageType: string;
}) {
  let score = 0;
  if (template.country === input.country) score += 16;
  if (template.language === input.language) score += 8;
  if (template.platform === input.platform) score += 4;
  if (template.category === input.category) score += 2;
  if (template.imageType === input.imageType) score += 32;
  return score;
}

export function listTemplates(filters: TemplateFilters = {}): TemplateRecord[] {
  const database = getDb();
  const clauses: string[] = [];
  const values: string[] = [];

  if (filters.search) {
    clauses.push("(name LIKE ? OR prompt_template LIKE ? OR copy_template LIKE ?)");
    values.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.country) {
    clauses.push("country = ?");
    values.push(filters.country);
  }
  if (filters.language) {
    clauses.push("language = ?");
    values.push(filters.language);
  }
  if (filters.platform) {
    clauses.push("platform = ?");
    values.push(filters.platform);
  }
  if (filters.category) {
    clauses.push("category = ?");
    values.push(filters.category);
  }
  if (filters.imageType) {
    clauses.push("image_type = ?");
    values.push(filters.imageType);
  }
  if (filters.source === "default") {
    clauses.push("is_default = 1");
  }
  if (filters.source === "custom") {
    clauses.push("is_default = 0");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return (database.prepare(`SELECT * FROM templates ${where} ORDER BY is_default DESC, updated_at DESC, name ASC`).all(...values) as any[]).map(
    rowToTemplate,
  );
}

export function getTemplateById(templateId: string): TemplateRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM templates WHERE id = ?").get(templateId) as any;
  return row ? rowToTemplate(row) : null;
}

export function createTemplate(input: TemplateInput): TemplateRecord {
  const database = getDb();
  const now = nowIso();
  const id = createId("tpl");

  database
    .prepare(
      `INSERT INTO templates (
        id, name, country, language, platform, category, image_type, prompt_template, copy_template, layout_style, is_default, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.name,
      input.country,
      input.language,
      input.platform,
      input.category,
      input.imageType,
      input.promptTemplate,
      input.copyTemplate,
      input.layoutStyle,
      input.isDefault ? 1 : 0,
      now,
      now,
    );

  return getTemplateById(id)!;
}

export function updateTemplate(templateId: string, input: Partial<TemplateInput>): TemplateRecord | null {
  const database = getDb();
  const existing = getTemplateById(templateId);
  if (!existing) {
    return null;
  }

  const nextTemplate = {
    name: input.name ?? existing.name,
    country: input.country ?? existing.country,
    language: input.language ?? existing.language,
    platform: input.platform ?? existing.platform,
    category: input.category ?? existing.category,
    imageType: input.imageType ?? existing.imageType,
    promptTemplate: input.promptTemplate ?? existing.promptTemplate,
    copyTemplate: input.copyTemplate ?? existing.copyTemplate,
    layoutStyle: input.layoutStyle ?? existing.layoutStyle,
    isDefault: input.isDefault ?? existing.isDefault,
  };

  database
    .prepare(
      `UPDATE templates SET
        name = ?,
        country = ?,
        language = ?,
        platform = ?,
        category = ?,
        image_type = ?,
        prompt_template = ?,
        copy_template = ?,
        layout_style = ?,
        is_default = ?,
        updated_at = ?
      WHERE id = ?`
    )
    .run(
      nextTemplate.name,
      nextTemplate.country,
      nextTemplate.language,
      nextTemplate.platform,
      nextTemplate.category,
      nextTemplate.imageType,
      nextTemplate.promptTemplate,
      nextTemplate.copyTemplate,
      nextTemplate.layoutStyle,
      nextTemplate.isDefault ? 1 : 0,
      nowIso(),
      templateId,
    );

  return getTemplateById(templateId);
}

export function deleteTemplate(templateId: string): boolean {
  const database = getDb();
  const existing = getTemplateById(templateId);
  if (!existing || existing.isDefault) {
    return false;
  }

  const result = database.prepare("DELETE FROM templates WHERE id = ?").run(templateId);
  return result.changes > 0;
}

export function resolveTemplate(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  imageType: string;
}): TemplateRecord | null {
  const candidates = listTemplateCandidates(input).filter(
    (template) =>
      matchesTemplateScope(template.country, input.country) &&
      matchesTemplateScope(template.language, input.language) &&
      matchesTemplateScope(template.platform, input.platform) &&
      matchesTemplateScope(template.category, input.category) &&
      matchesTemplateScope(template.imageType, input.imageType),
  );

  if (!candidates.length) {
    return null;
  }

  return candidates.sort((left, right) => {
    const scoreDelta = scoreTemplateMatch(right, input) - scoreTemplateMatch(left, input);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? 1 : -1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  })[0] ?? null;
}

export function listTemplateCandidates(input: {
  country: string;
  language: string;
  platform: string;
  category: string;
  imageType: string;
}): TemplateRecord[] {
  return listTemplates({ imageType: input.imageType }).sort((left, right) => {
    const scoreDelta = scoreTemplateMatch(right, input) - scoreTemplateMatch(left, input);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? 1 : -1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function createJob(input: CreateJobInput): JobRecord {
  const database = getDb();
  const now = nowIso();
  database.exec("BEGIN");

  try {
    database
      .prepare(
        `INSERT INTO jobs (
          id, status, creation_mode, generation_semantics, strategy_workflow_mode, reference_remake_goal, reference_strength, reference_composition_lock, reference_text_region_policy, reference_background_mode, preserve_reference_text, reference_copy_mode, product_name, sku, category, brand_name, selling_points, restrictions, custom_prompt, prompt_inputs_json, custom_negative_prompt, translate_prompt_to_output_language, auto_optimize_prompt, reference_extra_prompt, reference_negative_prompt, country, language, platform,
          selected_types, selected_ratios, selected_resolutions, variants_per_type, include_copy_layout,
          batch_file_count, created_at, updated_at, source_description, ui_language, selected_template_overrides, marketing_strategy_json,
          reference_layout_override_json, reference_poster_copy_override_json
        ) VALUES (
          ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`
      )
      .run(
        input.id,
        input.creationMode,
        input.generationSemantics,
        input.strategyWorkflowMode,
        input.referenceRemakeGoal,
        input.referenceStrength,
        input.referenceCompositionLock,
        input.referenceTextRegionPolicy,
        input.referenceBackgroundMode,
        input.preserveReferenceText ? 1 : 0,
        input.referenceCopyMode,
        input.productName,
        input.sku,
        input.category,
        input.brandName,
        input.sellingPoints,
        input.restrictions,
        input.customPrompt,
        toJson(input.promptInputs),
        input.customNegativePrompt,
        input.translatePromptToOutputLanguage ? 1 : 0,
        input.autoOptimizePrompt ? 1 : 0,
        input.referenceExtraPrompt,
        input.referenceNegativePrompt,
        input.country,
        input.language,
        input.platform,
        toJson(input.selectedTypes),
        toJson(input.selectedRatios),
        toJson(input.selectedResolutions),
        input.variantsPerType,
        input.includeCopyLayout ? 1 : 0,
        input.batchFileCount,
        now,
        now,
        input.sourceDescription,
        input.uiLanguage,
        toJson(input.selectedTemplateOverrides),
        toJson(input.marketingStrategy),
        toJson(input.referenceLayoutOverride),
        toJson(input.referencePosterCopyOverride),
      );

    const insertAsset = database.prepare(
      `INSERT INTO assets (
        id, job_id, job_item_id, kind, original_name, mime_type, file_path, width, height, size_bytes, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const asset of [...input.sourceAssets, ...input.referenceAssets]) {
      insertAsset.run(
        asset.id,
        asset.jobId,
        asset.jobItemId,
        asset.kind,
        asset.originalName,
        asset.mimeType,
        asset.filePath,
        asset.width,
        asset.height,
        asset.sizeBytes,
        asset.sha256,
        asset.createdAt,
      );
    }

    const insertItem = database.prepare(
      `INSERT INTO job_items (
        id, job_id, source_asset_id, source_asset_name, image_type, ratio, resolution_label, width, height, variant_index, prompt_input_index,
        image_strategy_json, strategy_edited, visual_audit_json, generation_attempt, auto_retried_from_audit, status, prompt_text, negative_prompt, copy_json, generated_asset_id, layout_asset_id, review_status, warning_message, provider_debug_json, created_at, updated_at, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of input.items) {
      insertItem.run(
        item.id,
        item.jobId,
        item.sourceAssetId,
        item.sourceAssetName,
        item.imageType,
        item.ratio,
        item.resolutionLabel,
        item.width,
        item.height,
        item.variantIndex,
        item.promptInputIndex,
        toJson(item.imageStrategy),
        item.strategyEdited ? 1 : 0,
        toJson(item.visualAudit),
        item.generationAttempt,
        item.autoRetriedFromAudit ? 1 : 0,
        item.status,
        item.promptText,
        item.negativePrompt,
        item.copyJson,
        item.generatedAssetId,
        item.layoutAssetId,
        item.reviewStatus,
        item.warningMessage,
        toJson(item.providerDebug),
        item.createdAt,
        item.updatedAt,
        item.errorMessage,
      );
    }

    database.exec("COMMIT");
    return getJobById(input.id)!;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function getJobById(jobId: string): JobRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as any;
  return row ? rowToJob(row) : null;
}

export function getJobDetails(jobId: string): JobDetails | null {
  const database = getDb();
  const job = getJobById(jobId);
  if (!job) {
    return null;
  }

  const sourceAssets = (database
    .prepare("SELECT * FROM assets WHERE job_id = ? AND kind = 'source' ORDER BY created_at ASC")
    .all(jobId) as any[]).map((row) => ensureActualAssetDimensions(rowToAsset(row)));
  const referenceAssets = (database
    .prepare("SELECT * FROM assets WHERE job_id = ? AND kind = 'reference' ORDER BY created_at ASC")
    .all(jobId) as any[]).map((row) => ensureActualAssetDimensions(rowToAsset(row)));
  const items = (database
    .prepare("SELECT * FROM job_items WHERE job_id = ? ORDER BY created_at ASC")
    .all(jobId) as any[]).map(rowToItem);
  const allAssets = (database.prepare("SELECT * FROM assets WHERE job_id = ?").all(jobId) as any[]).map((row) =>
    ensureActualAssetDimensions(rowToAsset(row)),
  );
  const assetMap = new Map(allAssets.map((asset) => [asset.id, asset]));

  return {
    job,
    sourceAssets,
    referenceAssets,
    items: items.map((item) => ({
      ...item,
      generatedAsset: item.generatedAssetId ? assetMap.get(item.generatedAssetId) ?? null : null,
      layoutAsset: item.layoutAssetId ? assetMap.get(item.layoutAssetId) ?? null : null,
      copy: fromJson<GeneratedCopyBundle | null>(item.copyJson, null),
    })),
  };
}

export function getJobItemById(itemId: string): JobItemRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM job_items WHERE id = ?").get(itemId) as any;
  return row ? rowToItem(row) : null;
}

export function listJobs(filters: JobListFilters = {}, options: { limit?: number; offset?: number } = {}): JobRecord[] {
  const database = getDb();
  const { where, values } = buildJobListWhere(filters);
  const limit = Math.max(1, Math.min(options.limit ?? 200, 200));
  const offset = Math.max(0, options.offset ?? 0);
  const statement = database.prepare(`${JOB_LIST_SELECT} ${where} ORDER BY jobs.created_at DESC LIMIT ? OFFSET ?`);
  return attachJobPreviewAssets((statement.all(...values, limit, offset) as any[]).map(rowToJob));
}

export function summarizeJobs(filters: JobListFilters = {}): JobListSummary {
  const database = getDb();
  const { where, values } = buildJobListWhere(filters);
  const row = database
    .prepare(
      `SELECT
         COUNT(*) AS total_jobs,
         COALESCE(SUM(COALESCE(job_stats.generated_count, 0)), 0) AS total_generated,
         COALESCE(SUM(COALESCE(job_stats.succeeded_count, 0)), 0) AS total_succeeded,
         COALESCE(SUM(COALESCE(job_stats.failed_count, 0)), 0) AS total_failed
       FROM jobs
       LEFT JOIN (
         SELECT
           job_id,
           COUNT(*) AS generated_count,
           SUM(CASE WHEN generated_asset_id IS NOT NULL THEN 1 ELSE 0 END) AS succeeded_count,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
         FROM job_items
         GROUP BY job_id
       ) AS job_stats
         ON job_stats.job_id = jobs.id
       ${where}`,
    )
    .get(...values) as
    | {
        total_jobs: number;
        total_generated: number;
        total_succeeded: number;
        total_failed: number;
      }
    | undefined;

  return {
    totalJobs: Number(row?.total_jobs ?? 0),
    totalGenerated: Number(row?.total_generated ?? 0),
    totalSucceeded: Number(row?.total_succeeded ?? 0),
    totalFailed: Number(row?.total_failed ?? 0),
  };
}

export function listRecentJobs(limit = 6): JobRecord[] {
  const database = getDb();
  return (database.prepare(`${JOB_LIST_SELECT} ORDER BY jobs.created_at DESC LIMIT ?`).all(limit) as any[]).map(rowToJob);
}

export function listRecoverableJobIds(): string[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT DISTINCT jobs.id
       FROM jobs
       LEFT JOIN job_items ON job_items.job_id = jobs.id
       WHERE jobs.status IN ('queued', 'processing')
          OR job_items.status IN ('queued', 'processing')
       ORDER BY jobs.created_at ASC`,
    )
    .all() as Array<{ id: string }>;

  return rows.map((row) => row.id);
}

export function resetJobItemsToQueued(jobId: string) {
  const database = getDb();
  database
    .prepare("UPDATE job_items SET status = 'queued', updated_at = ? WHERE job_id = ? AND status = 'processing'")
    .run(nowIso(), jobId);
}

export function markJobQueued(jobId: string) {
  const database = getDb();
  database
    .prepare("UPDATE jobs SET status = 'queued', error_message = NULL, updated_at = ?, completed_at = NULL WHERE id = ?")
    .run(nowIso(), jobId);
}

export function getJobItemStatusSummary(jobId: string) {
  const database = getDb();
  const row = database
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
         SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count
       FROM job_items
       WHERE job_id = ?`,
    )
    .get(jobId) as
    | {
        total: number;
        queued_count: number;
        processing_count: number;
        completed_count: number;
        failed_count: number;
      }
    | undefined;

  return {
    total: Number(row?.total ?? 0),
    queuedCount: Number(row?.queued_count ?? 0),
    processingCount: Number(row?.processing_count ?? 0),
    completedCount: Number(row?.completed_count ?? 0),
    failedCount: Number(row?.failed_count ?? 0),
  };
}

export function getAssetById(assetId: string): AssetRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM assets WHERE id = ?").get(assetId) as any;
  return row ? rowToAsset(row) : null;
}

export function updateJobStatus(jobId: string, status: JobStatus, errorMessage?: string | null) {
  const database = getDb();
  const isFinished = status === "completed" || status === "failed" || status === "partial";
  database
    .prepare("UPDATE jobs SET status = ?, error_message = ?, updated_at = ?, completed_at = ? WHERE id = ?")
    .run(status, errorMessage ?? null, nowIso(), isFinished ? nowIso() : null, jobId);
}

export function updateJobLocalizedInputs(jobId: string, localizedInputs: LocalizedCreativeInputs | null) {
  const database = getDb();
  database
    .prepare("UPDATE jobs SET localized_inputs_json = ?, updated_at = ? WHERE id = ?")
    .run(toJson(localizedInputs), nowIso(), jobId);
}

export function updateJobReferenceArtifacts(
  jobId: string,
  referenceLayoutAnalysis: ReferenceLayoutAnalysis | null,
  referencePosterCopy: ReferencePosterCopy | null,
) {
  const database = getDb();
  database
    .prepare(
      "UPDATE jobs SET reference_layout_analysis_json = ?, reference_poster_copy_json = ?, updated_at = ? WHERE id = ?",
    )
    .run(toJson(referenceLayoutAnalysis), toJson(referencePosterCopy), nowIso(), jobId);
}

export function updateJobFeishuSyncState(jobId: string, recordId: string | null, fileTokens: string[]) {
  const database = getDb();
  database
    .prepare("UPDATE jobs SET feishu_record_id = ?, feishu_file_tokens_json = ?, updated_at = ? WHERE id = ?")
    .run(recordId, toJson(fileTokens), nowIso(), jobId);
}

export function updateJobItemProcessing(itemId: string) {
  const database = getDb();
  database.prepare("UPDATE job_items SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'queued'").run(nowIso(), itemId);
}

export function updateJobItemResult(input: {
  itemId: string;
  promptText: string;
  negativePrompt?: string | null;
  copy: GeneratedCopyBundle;
  generatedAssetId: string;
  layoutAssetId?: string | null;
  warningMessage?: string | null;
  providerDebug?: ProviderDebugInfo | null;
  visualAudit?: VisualAudit | null;
  generationAttempt?: number;
  autoRetriedFromAudit?: boolean;
}) {
  const database = getDb();
  database
    .prepare(
      `UPDATE job_items SET
        status = 'completed',
        prompt_text = ?,
        negative_prompt = ?,
        copy_json = ?,
        generated_asset_id = ?,
        layout_asset_id = ?,
        warning_message = ?,
        provider_debug_json = ?,
        visual_audit_json = ?,
        generation_attempt = ?,
        auto_retried_from_audit = ?,
        error_message = NULL,
        updated_at = ?
      WHERE id = ?`
    )
    .run(
      input.promptText,
      input.negativePrompt ?? null,
      toJson(input.copy),
      input.generatedAssetId,
      input.layoutAssetId ?? null,
      input.warningMessage ?? null,
      toJson(input.providerDebug ?? null),
      toJson(input.visualAudit ?? null),
      input.generationAttempt ?? 0,
      input.autoRetriedFromAudit ? 1 : 0,
      nowIso(),
      input.itemId,
    );
}

export function updateJobItemWarning(itemId: string, warningMessage: string | null) {
  const database = getDb();
  database.prepare("UPDATE job_items SET warning_message = ?, updated_at = ? WHERE id = ?").run(warningMessage, nowIso(), itemId);
}

export function updateJobItemFailure(
  itemId: string,
  errorMessage: string,
  promptText?: string | null,
  negativePrompt?: string | null,
  providerDebug?: ProviderDebugInfo | null,
  visualAudit?: VisualAudit | null,
  generationAttempt?: number,
  autoRetriedFromAudit?: boolean,
) {
  const database = getDb();
  database
    .prepare(
      "UPDATE job_items SET status = 'failed', prompt_text = COALESCE(?, prompt_text), negative_prompt = COALESCE(?, negative_prompt), provider_debug_json = ?, visual_audit_json = ?, generation_attempt = ?, auto_retried_from_audit = ?, error_message = ?, updated_at = ? WHERE id = ?",
    )
    .run(
      promptText ?? null,
      negativePrompt ?? null,
      toJson(providerDebug ?? null),
      toJson(visualAudit ?? null),
      generationAttempt ?? 0,
      autoRetriedFromAudit ? 1 : 0,
      errorMessage,
      nowIso(),
      itemId,
    );
}

export function insertAsset(asset: AssetRecord) {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO assets (
        id, job_id, job_item_id, kind, original_name, mime_type, file_path, width, height, size_bytes, sha256, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      asset.id,
      asset.jobId,
      asset.jobItemId,
      asset.kind,
      asset.originalName,
      asset.mimeType,
      asset.filePath,
      asset.width,
      asset.height,
      asset.sizeBytes,
      asset.sha256,
      asset.createdAt,
    );
}

export function listJobItems(jobId: string): JobItemRecord[] {
  const database = getDb();
  return (database.prepare("SELECT * FROM job_items WHERE job_id = ? ORDER BY created_at ASC").all(jobId) as any[]).map(rowToItem);
}

export function updateJobItemReviewStatus(itemId: string, reviewStatus: JobItemReviewStatus): JobItemRecord | null {
  const database = getDb();
  database.prepare("UPDATE job_items SET review_status = ?, updated_at = ? WHERE id = ?").run(reviewStatus, nowIso(), itemId);
  return getJobItemById(itemId);
}

export function listBrands(): BrandRecord[] {
  const database = getDb();
  return (database.prepare("SELECT * FROM brands ORDER BY updated_at DESC, name ASC").all() as any[]).map(rowToBrand);
}

export function getBrandById(brandId: string): BrandRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM brands WHERE id = ?").get(brandId) as any;
  return row ? rowToBrand(row) : null;
}

export function getBrandByName(name: string): BrandRecord | null {
  const database = getDb();
  const row = database.prepare("SELECT * FROM brands WHERE LOWER(name) = LOWER(?)").get(name.trim()) as any;
  return row ? rowToBrand(row) : null;
}

export function createBrand(input: BrandInput): BrandRecord {
  const database = getDb();
  const now = nowIso();
  const id = createId("brand");
  database
    .prepare(
      `INSERT INTO brands (
        id, name, primary_color, tone, banned_terms, prompt_guidance, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(id, input.name.trim(), input.primaryColor, input.tone, input.bannedTerms, input.promptGuidance, now, now);

  return getBrandById(id)!;
}

export function updateBrand(brandId: string, input: Partial<BrandInput>): BrandRecord | null {
  const database = getDb();
  const existing = getBrandById(brandId);
  if (!existing) {
    return null;
  }

  const nextBrand = {
    name: input.name?.trim() ?? existing.name,
    primaryColor: input.primaryColor ?? existing.primaryColor,
    tone: input.tone ?? existing.tone,
    bannedTerms: input.bannedTerms ?? existing.bannedTerms,
    promptGuidance: input.promptGuidance ?? existing.promptGuidance,
  };

  database
    .prepare(
      `UPDATE brands SET
        name = ?,
        primary_color = ?,
        tone = ?,
        banned_terms = ?,
        prompt_guidance = ?,
        updated_at = ?
      WHERE id = ?`
    )
    .run(nextBrand.name, nextBrand.primaryColor, nextBrand.tone, nextBrand.bannedTerms, nextBrand.promptGuidance, nowIso(), brandId);

  return getBrandById(brandId);
}

export function deleteBrand(brandId: string): boolean {
  const database = getDb();
  const result = database.prepare("DELETE FROM brands WHERE id = ?").run(brandId);
  return result.changes > 0;
}
