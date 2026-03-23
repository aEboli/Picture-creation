"use client";

import { useEffect, useState } from "react";

import type { UiLanguage } from "@/lib/types";

export function LanguageToggle({ language }: { language: UiLanguage }) {
  const [current, setCurrent] = useState<UiLanguage>(language);

  useEffect(() => {
    setCurrent(language);
  }, [language]);

  function handleChange(nextLanguage: UiLanguage) {
    document.cookie = `ui-language=${nextLanguage}; path=/; max-age=31536000; SameSite=Lax`;
    setCurrent(nextLanguage);
    window.location.reload();
  }

  return (
    <div className="language-toggle" role="group" aria-label="UI language">
      <button
        className={current === "zh" ? "is-active" : undefined}
        onClick={() => handleChange("zh")}
        type="button"
      >
        中文
      </button>
      <button
        className={current === "en" ? "is-active" : undefined}
        onClick={() => handleChange("en")}
        type="button"
      >
        EN
      </button>
    </div>
  );
}
