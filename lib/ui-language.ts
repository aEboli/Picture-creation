import { cookies } from "next/headers";

import type { UiLanguage } from "@/lib/types";

export async function getUiLanguage(): Promise<UiLanguage> {
  const cookieStore = await cookies();
  const value = cookieStore.get("ui-language")?.value;
  return value === "en" ? "en" : "zh";
}
