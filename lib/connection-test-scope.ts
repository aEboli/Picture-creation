import type { AppSettings } from "@/lib/types";

type FeishuConnectionFields = Pick<
  AppSettings,
  "feishuSyncEnabled" | "feishuAppId" | "feishuAppSecret" | "feishuBitableAppToken" | "feishuBitableTableId"
>;

export function shouldTestFeishuConnection(settings: FeishuConnectionFields) {
  return (
    settings.feishuSyncEnabled ||
    Boolean(settings.feishuAppId.trim()) ||
    Boolean(settings.feishuAppSecret.trim()) ||
    Boolean(settings.feishuBitableAppToken.trim()) ||
    Boolean(settings.feishuBitableTableId.trim())
  );
}
