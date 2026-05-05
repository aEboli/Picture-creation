"use client";

import { useEffect, useState } from "react";

import type { UiLanguage } from "@/lib/types";

type AppTheme = "dark" | "light";

export const PICTURE_CREATION_THEME_KEY = "picture-creation-theme";

function isAppTheme(value: string | null): value is AppTheme {
  return value === "dark" || value === "light";
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
}

function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";

  const storedTheme = window.localStorage.getItem(PICTURE_CREATION_THEME_KEY);
  return isAppTheme(storedTheme) ? storedTheme : "dark";
}

function SunIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 7.5 7.5 0 1 0 20.5 14.5Z" />
    </svg>
  );
}

export function ThemeToggle({
  compact = false,
  language,
}: {
  compact?: boolean;
  language: UiLanguage;
}) {
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    const storedTheme = readStoredTheme();
    setTheme(storedTheme);
    applyTheme(storedTheme);

    function handleThemeChange(event: Event) {
      const nextTheme = (event as CustomEvent<AppTheme>).detail;
      if (!isAppTheme(nextTheme)) return;
      setTheme(nextTheme);
      applyTheme(nextTheme);
    }

    function handleStorageChange(event: StorageEvent) {
      if (event.key !== PICTURE_CREATION_THEME_KEY || !isAppTheme(event.newValue)) return;
      setTheme(event.newValue);
      applyTheme(event.newValue);
    }

    window.addEventListener("picture-creation-theme-change", handleThemeChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("picture-creation-theme-change", handleThemeChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  function handleChange(nextTheme: AppTheme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(PICTURE_CREATION_THEME_KEY, nextTheme);
    window.dispatchEvent(new CustomEvent<AppTheme>("picture-creation-theme-change", { detail: nextTheme }));
  }

  const text =
    language === "zh"
      ? {
          group: "切换主题",
          dark: "深色",
          light: "白色",
        }
      : {
          group: "Switch theme",
          dark: "Dark",
          light: "White",
        };

  return (
    <div className={`theme-toggle ${compact ? "is-compact" : ""}`} role="group" aria-label={text.group}>
      <button
        aria-pressed={theme === "dark"}
        className={`theme-toggle-button ${theme === "dark" ? "is-active" : ""}`}
        onClick={() => handleChange("dark")}
        title={text.dark}
        type="button"
      >
        <MoonIcon />
        <span>{text.dark}</span>
      </button>
      <button
        aria-pressed={theme === "light"}
        className={`theme-toggle-button ${theme === "light" ? "is-active" : ""}`}
        onClick={() => handleChange("light")}
        title={text.light}
        type="button"
      >
        <SunIcon />
        <span>{text.light}</span>
      </button>
    </div>
  );
}
