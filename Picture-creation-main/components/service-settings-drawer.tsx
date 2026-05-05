"use client";

import { type FormEvent, useEffect, useMemo, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { shouldTestFeishuConnection } from "@/lib/connection-test-scope";
import {
  DEFAULT_BROWSER_API_SETTINGS,
  readBrowserApiSettings,
  writeBrowserApiSettings,
} from "@/lib/browser-api-settings";
import { SERVICE_SETTINGS_QUICK_OPEN_EVENT, type ServiceSettingsQuickTarget } from "@/lib/service-settings-events";
import type { AppSettings, ServiceDrawerSettings, UiLanguage } from "@/lib/types";

type TestResult = {
  ok: boolean;
  message: string;
};

type ServiceDrawerMode = "all" | ServiceSettingsQuickTarget;

function GearIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.573-1.066z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function ServiceSettingsDrawer({
  initialSettings,
  language,
}: {
  initialSettings: ServiceDrawerSettings;
  language: UiLanguage;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<ServiceDrawerMode>("all");
  const [formState, setFormState] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isTesting, startTestingTransition] = useTransition();

  const text = useMemo(
    () =>
      language === "zh"
        ? {
            open: "打开服务配置",
            close: "关闭服务配置",
            title: "服务配置",
            subtitle: "快速配置 API、飞书同步和素材输出目录。",
            quickTitles: {
              api: "API 快速配置",
              feishu: "飞书快速配置",
            },
            quickSubtitles: {
              api: "只调整 API Key、Responses URL 和模型。",
              feishu: "只调整飞书同步开关、凭据和表格参数。",
            },
            fullSettings: "完整设置页",
            sections: {
              api: "API 服务",
              feishu: "飞书同步",
              output: "素材输出",
            },
            labels: {
              defaultProvider: "API 提供商",
              defaultApiKey: "默认 API Key",
              defaultApiBaseUrl: "Responses API URL / 中转地址",
              defaultTextModel: "文本模型",
              defaultImageModel: "图像模型",
              feishuSyncEnabled: "启用飞书同步",
              feishuAppId: "飞书 App ID",
              feishuAppSecret: "飞书 App Secret",
              feishuBitableAppToken: "多维表格 App Token",
              feishuBitableTableId: "多维表格 Table ID",
              feishuUploadParentType: "图片上传类型",
              storageDir: "选择目录",
              maxConcurrency: "并发任务数",
            },
            actions: {
              save: "保存配置",
              saving: "保存中...",
              saved: "配置已保存",
              saveFailed: "保存失败",
              test: "测试连接",
              testing: "测试中...",
              testOk: "连接测试通过",
              testFailed: "连接测试失败",
              providerOk: "API 连接成功",
              providerFailed: "API 连接失败",
              feishuOk: "飞书连接成功",
              feishuFailed: "飞书连接失败",
              feishuSkipped: "飞书未启用，已跳过",
              unknownError: "未知错误",
            },
          }
        : {
            open: "Open service configuration",
            close: "Close service configuration",
            title: "Service Configuration",
            subtitle: "Configure API, Feishu sync, and asset output directory.",
            quickTitles: {
              api: "API Quick Setup",
              feishu: "Feishu Quick Setup",
            },
            quickSubtitles: {
              api: "Only edit the API key, Responses URL, and models.",
              feishu: "Only edit Feishu sync, credentials, and Bitable settings.",
            },
            fullSettings: "Full settings page",
            sections: {
              api: "API service",
              feishu: "Feishu sync",
              output: "Asset output",
            },
            labels: {
              defaultProvider: "API provider",
              defaultApiKey: "Default API key",
              defaultApiBaseUrl: "Responses API URL / relay URL",
              defaultTextModel: "Text model",
              defaultImageModel: "Image model",
              feishuSyncEnabled: "Enable Feishu sync",
              feishuAppId: "Feishu App ID",
              feishuAppSecret: "Feishu App Secret",
              feishuBitableAppToken: "Bitable app token",
              feishuBitableTableId: "Bitable table ID",
              feishuUploadParentType: "Image upload type",
              storageDir: "Selected directory",
              maxConcurrency: "Max concurrent jobs",
            },
            actions: {
              save: "Save configuration",
              saving: "Saving...",
              saved: "Configuration saved",
              saveFailed: "Save failed",
              test: "Test connections",
              testing: "Testing...",
              testOk: "Connection test passed",
              testFailed: "Connection test failed",
              providerOk: "API connection succeeded",
              providerFailed: "API connection failed",
              feishuOk: "Feishu connection succeeded",
              feishuFailed: "Feishu connection failed",
              feishuSkipped: "Feishu sync is disabled; skipped",
              unknownError: "Unknown error",
            },
          },
    [language],
  );

  const feedbackTone = message.startsWith(text.actions.saved) || message.startsWith(text.actions.testOk)
    ? "is-success"
    : message.startsWith(text.actions.saveFailed) || message.startsWith(text.actions.testFailed)
      ? "is-danger"
      : "is-info";

  const activeTitle = drawerMode === "all" ? text.title : text.quickTitles[drawerMode];
  const activeSubtitle = drawerMode === "all" ? text.subtitle : text.quickSubtitles[drawerMode];
  const shouldShowApiSection = drawerMode === "all" || drawerMode === "api";
  const shouldShowFeishuSection = drawerMode === "all" || drawerMode === "feishu";
  const shouldShowOutputSection = drawerMode === "all";

  function patchSettings(patch: Partial<AppSettings>) {
    setFormState((current) => ({ ...current, ...patch }));
  }

  function writeLocalApiSettings(settings: ServiceDrawerSettings) {
    writeBrowserApiSettings({
      provider: "openai",
      apiKey: settings.defaultApiKey,
      apiBaseUrl: settings.defaultApiBaseUrl,
      apiHeaders: settings.defaultApiHeaders,
      textModel: settings.defaultTextModel,
      imageModel: settings.defaultImageModel,
    });
  }

  useEffect(() => {
    const browserSettings = readBrowserApiSettings();
    setFormState((current) => ({
      ...current,
      defaultProvider: browserSettings.provider,
      defaultApiKey: browserSettings.apiKey,
      defaultApiBaseUrl: browserSettings.apiBaseUrl,
      defaultApiHeaders: browserSettings.apiHeaders,
      defaultTextModel: browserSettings.textModel,
      defaultImageModel: browserSettings.imageModel,
    }));
  }, []);

  useEffect(() => {
    function handleQuickOpen(event: Event) {
      const target = (event as CustomEvent<{ target?: ServiceSettingsQuickTarget }>).detail?.target;
      if (target !== "api" && target !== "feishu") return;

      setMessage("");
      setDrawerMode(target);
      setIsOpen(true);
    }

    window.addEventListener(SERVICE_SETTINGS_QUICK_OPEN_EVENT, handleQuickOpen);
    return () => window.removeEventListener(SERVICE_SETTINGS_QUICK_OPEN_EVENT, handleQuickOpen);
  }, []);

  function buildSettingsPayloadForSave(settings: ServiceDrawerSettings): Partial<AppSettings> {
    const {
      hasExistingDefaultApiKey,
      hasExistingDefaultApiHeaders,
      hasExistingFeishuAppSecret,
      ...rawPayload
    } = settings;
    const payload: Partial<AppSettings> = rawPayload;

    payload.defaultProvider = "openai";
    payload.defaultApiKey = "";
    payload.defaultApiBaseUrl = "";
    payload.defaultApiHeaders = "";
    payload.defaultTextModel = DEFAULT_BROWSER_API_SETTINGS.textModel;
    payload.defaultImageModel = DEFAULT_BROWSER_API_SETTINGS.imageModel;
    delete payload.feishuFieldMappingJson;
    delete payload.agentSettingsJson;

    if (hasExistingFeishuAppSecret && !payload.feishuAppSecret?.trim()) {
      delete payload.feishuAppSecret;
    }

    return payload;
  }

  async function handleJsonRequest(url: string, okPrefix: string, failedPrefix: string): Promise<TestResult> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formState),
    });

    const body = (await response.json().catch(() => null)) as { error?: string; result?: string } | null;
    if (!response.ok) {
      return {
        ok: false,
        message: `${failedPrefix}: ${body?.error ?? text.actions.unknownError}`,
      };
    }

    return {
      ok: true,
      message: `${okPrefix}: ${body?.result ?? "OK"}`,
    };
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    writeLocalApiSettings(formState);

    startTransition(async () => {
      const response = await fetch("/api/settings?redacted=1", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildSettingsPayloadForSave(formState)),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(`${text.actions.saveFailed}: ${body?.error ?? text.actions.unknownError}`);
        return;
      }

      const body = (await response.json().catch(() => null)) as ServiceDrawerSettings | null;
      if (body) {
        const browserSettings = readBrowserApiSettings();
        setFormState({
          ...body,
          defaultProvider: browserSettings.provider,
          defaultApiKey: browserSettings.apiKey,
          defaultApiBaseUrl: browserSettings.apiBaseUrl,
          defaultApiHeaders: browserSettings.apiHeaders,
          defaultTextModel: browserSettings.textModel,
          defaultImageModel: browserSettings.imageModel,
        });
      }
      setMessage(text.actions.saved);
      router.refresh();
    });
  }

  function handleConnectionTest() {
    setMessage("");

    startTestingTransition(async () => {
      if (drawerMode === "api") {
        const providerResult = await handleJsonRequest("/api/settings/test", text.actions.providerOk, text.actions.providerFailed);
        if (providerResult.ok) {
          writeLocalApiSettings(formState);
        }
        setMessage(`${providerResult.ok ? text.actions.testOk : text.actions.testFailed}: ${providerResult.message}`);
        router.refresh();
        return;
      }

      if (drawerMode === "feishu") {
        const feishuResult = shouldTestFeishuConnection(formState)
          ? await handleJsonRequest("/api/settings/test-feishu", text.actions.feishuOk, text.actions.feishuFailed)
          : { ok: true, message: text.actions.feishuSkipped };
        setMessage(`${feishuResult.ok ? text.actions.testOk : text.actions.testFailed}: ${feishuResult.message}`);
        router.refresh();
        return;
      }

      const providerResult = await handleJsonRequest("/api/settings/test", text.actions.providerOk, text.actions.providerFailed);
      if (providerResult.ok) {
        writeLocalApiSettings(formState);
      }
      const feishuResult = shouldTestFeishuConnection(formState)
        ? await handleJsonRequest("/api/settings/test-feishu", text.actions.feishuOk, text.actions.feishuFailed)
        : { ok: true, message: text.actions.feishuSkipped };
      const summaryPrefix = providerResult.ok && feishuResult.ok ? text.actions.testOk : text.actions.testFailed;
      setMessage(`${summaryPrefix}: ${providerResult.message} | ${feishuResult.message}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        aria-controls="service-settings-panel"
        aria-expanded={isOpen}
        aria-label={text.open}
        className="service-settings-gear"
        onClick={() => {
          setMessage("");
          setDrawerMode("all");
          setIsOpen(true);
        }}
        type="button"
      >
        <GearIcon />
      </button>

      <div aria-hidden={!isOpen} className={`service-settings-layer ${isOpen ? "is-open" : ""}`}>
        <button aria-label={text.close} className="service-settings-backdrop" onClick={() => setIsOpen(false)} type="button" />
        <aside aria-labelledby="service-settings-title" aria-modal="true" className="service-settings-panel" id="service-settings-panel" role="dialog">
          <form className={`service-config-form service-config-form-${drawerMode}`} onSubmit={handleSubmit}>
            <header className="service-config-header">
              <div>
                <h2 id="service-settings-title">{activeTitle}</h2>
                <p>{activeSubtitle}</p>
              </div>
              <button aria-label={text.close} className="service-config-close" onClick={() => setIsOpen(false)} type="button">
                <span aria-hidden="true">x</span>
              </button>
            </header>

            <div className="service-config-scroll">
              {shouldShowApiSection ? (
              <section className="service-config-section service-config-section-api">
                <h3>{text.sections.api}</h3>
                <div className="service-config-grid">
                  <label>
                    <span>{text.labels.defaultProvider}</span>
                    <select value={formState.defaultProvider || "gemini"} onChange={(event) => patchSettings({ defaultProvider: event.target.value })}>
                      <option value="gemini">API / 中转</option>
                      <option value="openai">OpenAI 兼容</option>
                    </select>
                  </label>
                  <label>
                    <span>{text.labels.defaultApiKey}</span>
                    <input type="password" value={formState.defaultApiKey} onChange={(event) => patchSettings({ defaultApiKey: event.target.value })} />
                  </label>
                  <label className="service-config-wide">
                    <span>{text.labels.defaultApiBaseUrl}</span>
                    <input placeholder="https://api.asxs.top/v1/responses" value={formState.defaultApiBaseUrl} onChange={(event) => patchSettings({ defaultApiBaseUrl: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.labels.defaultTextModel}</span>
                    <input value={formState.defaultTextModel} onChange={(event) => patchSettings({ defaultTextModel: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.labels.defaultImageModel}</span>
                    <input value={formState.defaultImageModel} onChange={(event) => patchSettings({ defaultImageModel: event.target.value })} />
                  </label>
                </div>
              </section>
              ) : null}

              {shouldShowFeishuSection ? (
              <section className="service-config-section service-config-section-feishu">
                <h3>{text.sections.feishu}</h3>
                <div className="service-config-grid">
                  <label className="service-config-check service-config-wide">
                    <input checked={formState.feishuSyncEnabled} onChange={(event) => patchSettings({ feishuSyncEnabled: event.target.checked })} type="checkbox" />
                    <span>{text.labels.feishuSyncEnabled}</span>
                  </label>
                  <label>
                    <span>{text.labels.feishuAppId}</span>
                    <input value={formState.feishuAppId} onChange={(event) => patchSettings({ feishuAppId: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.labels.feishuAppSecret}</span>
                    <input type="password" value={formState.feishuAppSecret} onChange={(event) => patchSettings({ feishuAppSecret: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.labels.feishuBitableAppToken}</span>
                    <input value={formState.feishuBitableAppToken} onChange={(event) => patchSettings({ feishuBitableAppToken: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.labels.feishuBitableTableId}</span>
                    <input value={formState.feishuBitableTableId} onChange={(event) => patchSettings({ feishuBitableTableId: event.target.value })} />
                  </label>
                  <label className="service-config-wide">
                    <span>{text.labels.feishuUploadParentType}</span>
                    <input value={formState.feishuUploadParentType} onChange={(event) => patchSettings({ feishuUploadParentType: event.target.value })} />
                  </label>
                </div>
              </section>
              ) : null}

              {shouldShowOutputSection ? (
              <section className="service-config-section service-config-section-output">
                <h3>{text.sections.output}</h3>
                <div className="service-config-grid">
                  <label className="service-config-wide">
                    <span>{text.labels.storageDir}</span>
                    <input value={formState.storageDir} onChange={(event) => patchSettings({ storageDir: event.target.value })} />
                  </label>
                  <label>
                    <span>{text.labels.maxConcurrency}</span>
                    <input min={1} max={6} type="number" value={formState.maxConcurrency} onChange={(event) => patchSettings({ maxConcurrency: Number(event.target.value) || 1 })} />
                  </label>
                </div>
              </section>
              ) : null}
            </div>

            <footer className="service-config-footer">
              {message ? <p className={`settings-feedback ${feedbackTone}`}>{message}</p> : null}
              <div className={`service-config-actions ${drawerMode === "all" ? "" : "is-quick"}`}>
                {drawerMode === "all" ? (
                <Link className="ghost-button service-config-full-link" href="/settings" onClick={() => setIsOpen(false)}>
                  {text.fullSettings}
                </Link>
                ) : null}
                <button className="primary-button" disabled={isPending || isTesting} onClick={handleConnectionTest} type="button">
                  {isTesting ? text.actions.testing : text.actions.test}
                </button>
                <button className="primary-button" disabled={isPending || isTesting} type="submit">
                  {isPending ? text.actions.saving : text.actions.save}
                </button>
              </div>
            </footer>
          </form>
        </aside>
      </div>
    </>
  );
}
