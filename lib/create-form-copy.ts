import type { UiLanguage } from "@/lib/types";

export function formatImageCounter(language: UiLanguage, current: number, total: number) {
  if (language === "zh") {
    return `${current}/${total}`;
  }

  return `${current} / ${total}`;
}
