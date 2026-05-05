import "server-only";

import { getSettings, updateSettings } from "@/lib/db";
import type { AppSettings } from "@/lib/types";

export function getSettingsSnapshot(): AppSettings {
  return getSettings();
}

export function updateSettingsSnapshot(input: Partial<AppSettings>): AppSettings {
  return updateSettings(input);
}
