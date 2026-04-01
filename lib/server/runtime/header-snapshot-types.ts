export type RuntimeIntegrationState = "ready" | "partial" | "inactive";

export interface RuntimeHeaderIntegrations {
  gemini: RuntimeIntegrationState;
  feishu: RuntimeIntegrationState;
  lan: RuntimeIntegrationState;
}

export interface RuntimeHeaderSummary {
  totalJobs: number;
  totalGenerated: number;
  totalSucceeded: number;
  totalFailed: number;
}

export interface RuntimeHeaderSnapshot {
  integrations: RuntimeHeaderIntegrations;
  summary: RuntimeHeaderSummary;
  refreshedAt: string;
  stale: boolean;
}
