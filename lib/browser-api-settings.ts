export const BROWSER_API_SETTINGS_STORAGE_KEY = "picture-creation-browser-api-settings-v1";

export interface BrowserApiSettings {
  provider: "openai";
  apiKey: string;
  apiBaseUrl: string;
  apiHeaders: string;
  textModel: string;
  imageModel: string;
}

export const DEFAULT_BROWSER_API_SETTINGS: BrowserApiSettings = {
  provider: "openai",
  apiKey: "",
  apiBaseUrl: "https://api.openai.com/v1/responses",
  apiHeaders: "",
  textModel: "gpt-5.5",
  imageModel: "gpt-5.5",
};

export function normalizeBrowserApiSettings(input?: Partial<BrowserApiSettings> | null): BrowserApiSettings {
  return {
    provider: "openai",
    apiKey: input?.apiKey?.trim() ?? DEFAULT_BROWSER_API_SETTINGS.apiKey,
    apiBaseUrl: input?.apiBaseUrl?.trim() ?? DEFAULT_BROWSER_API_SETTINGS.apiBaseUrl,
    apiHeaders: input?.apiHeaders ?? DEFAULT_BROWSER_API_SETTINGS.apiHeaders,
    textModel: input?.textModel?.trim() || DEFAULT_BROWSER_API_SETTINGS.textModel,
    imageModel: input?.imageModel?.trim() || DEFAULT_BROWSER_API_SETTINGS.imageModel,
  };
}

export function readBrowserApiSettings(): BrowserApiSettings {
  if (typeof window === "undefined") {
    return DEFAULT_BROWSER_API_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_API_SETTINGS_STORAGE_KEY);
    return normalizeBrowserApiSettings(raw ? (JSON.parse(raw) as Partial<BrowserApiSettings>) : null);
  } catch {
    return DEFAULT_BROWSER_API_SETTINGS;
  }
}

export function writeBrowserApiSettings(settings: BrowserApiSettings) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(BROWSER_API_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeBrowserApiSettings(settings)));
}
