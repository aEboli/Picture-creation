"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";

import {
  formatFeishuFieldMapping,
  getLegacyFeishuFieldMappingJson,
  getRecommendedFeishuFieldMappingJson,
} from "@/lib/feishu-field-mapping";
import type { AppSettings, UiLanguage } from "@/lib/types";

type TestResult = {
  ok: boolean;
  message: string;
};

export function SettingsForm({ initialSettings, language }: { initialSettings: AppSettings; language: UiLanguage }) {
  const [formState, setFormState] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [combinedTestMessage, setCombinedTestMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isTestingCombined, startCombinedTestTransition] = useTransition();
  const legacyFeishuMappingJson = useMemo(() => getLegacyFeishuFieldMappingJson(), []);
  const recommendedFeishuMappingJson = useMemo(() => getRecommendedFeishuFieldMappingJson(), []);

  const text = useMemo(
    () =>
      language === "zh"
        ? {
            sections: {
              gemini: "Gemini / 中转设置",
              feishu: "飞书多维表格同步",
              storage: "素材与任务",
            },
            labels: {
              defaultApiKey: "默认 API Key",
              defaultTextModel: "默认文本模型",
              defaultImageModel: "默认图像模型",
              defaultApiBaseUrl: "Gemini Base URL / 中转地址",
              defaultApiVersion: "API 版本",
              defaultApiHeaders: "自定义请求头 JSON（可选）",
              storageDir: "素材存储目录",
              maxConcurrency: "并发任务数",
              feishuSyncEnabled: "启用飞书多维表格自动同步",
              feishuAppId: "飞书 App ID",
              feishuAppSecret: "飞书 App Secret",
              feishuBitableAppToken: "多维表格 App Token",
              feishuBitableTableId: "多维表格 Table ID",
              feishuUploadParentType: "飞书上传 parent_type",
              feishuFieldMappingJson: "多维表格字段映射 JSON",
            },
            hero: {
              title: "设置中心",
              subtitle: "统一管理 Gemini、飞书同步与本地素材任务。",
              idleFeedback: "点击“全局连接测试”后，会在这里显示紧凑测试结果。",
            },
            actions: {
              save: "保存全部设置",
              saving: "保存中...",
              saved: "设置已保存",
              saveFailed: "保存失败",
              testAllConnections: "全局连接测试",
              testingAllConnections: "测试中...",
              testAllOk: "全局连接测试通过",
              testAllFailed: "全局连接测试失败",
              providerOk: "Gemini / 中转连接成功",
              providerFailed: "Gemini / 中转连接失败",
              feishuOk: "飞书连接成功",
              feishuFailed: "飞书连接失败",
              unknownError: "未知错误",
              fillRecommendedMapping: "填入推荐模板",
              formatMapping: "格式化映射",
            },
          }
        : {
            sections: {
              gemini: "Gemini / relay settings",
              feishu: "Feishu Bitable sync",
              storage: "Assets and queue",
            },
            labels: {
              defaultApiKey: "Default API key",
              defaultTextModel: "Default text model",
              defaultImageModel: "Default image model",
              defaultApiBaseUrl: "Gemini base URL / relay URL",
              defaultApiVersion: "API version",
              defaultApiHeaders: "Custom headers JSON (optional)",
              storageDir: "Asset storage directory",
              maxConcurrency: "Max concurrent jobs",
              feishuSyncEnabled: "Enable automatic Feishu Bitable sync",
              feishuAppId: "Feishu App ID",
              feishuAppSecret: "Feishu App Secret",
              feishuBitableAppToken: "Bitable app token",
              feishuBitableTableId: "Bitable table ID",
              feishuUploadParentType: "Feishu upload parent_type",
              feishuFieldMappingJson: "Bitable field mapping JSON",
            },
            hero: {
              title: "Settings Center",
              subtitle: "Manage Gemini, Feishu sync, and local runtime controls in one place.",
              idleFeedback: "Run the global connection check to see compact status feedback here.",
            },
            actions: {
              save: "Save all settings",
              saving: "Saving...",
              saved: "Settings saved",
              saveFailed: "Save failed",
              testAllConnections: "Global connection test",
              testingAllConnections: "Testing...",
              testAllOk: "Global connection test passed",
              testAllFailed: "Global connection test failed",
              providerOk: "Gemini / relay connection succeeded",
              providerFailed: "Gemini / relay connection failed",
              feishuOk: "Feishu connection succeeded",
              feishuFailed: "Feishu connection failed",
              unknownError: "Unknown error",
              fillRecommendedMapping: "Use recommended template",
              formatMapping: "Format mapping",
            },
          },
    [language],
  );

  const mappingTemplateText = useMemo(
    () =>
      language === "zh"
        ? {
            legacy: "旧映射",
            recommended: "新模板",
          }
        : {
            legacy: "Legacy template",
            recommended: "New template",
          },
    [language],
  );

  const combinedFeedback = combinedTestMessage || message;
  const globalFeedback = combinedFeedback;
  const globalFeedbackTone = useMemo(() => {
    if (!globalFeedback) {
      return "";
    }

    const successPrefixes = [text.actions.saved, text.actions.testAllOk];
    const failedPrefixes = [text.actions.saveFailed, text.actions.testAllFailed];
    const matchesPrefix = (prefix: string) => globalFeedback === prefix || globalFeedback.startsWith(`${prefix}:`);

    if (successPrefixes.some(matchesPrefix)) {
      return "is-success";
    }
    if (failedPrefixes.some(matchesPrefix)) {
      return "is-danger";
    }

    return message ? "is-danger" : "is-info";
  }, [globalFeedback, message, text.actions.saveFailed, text.actions.saved, text.actions.testAllFailed, text.actions.testAllOk]);

  function patchSettings(patch: Partial<AppSettings>) {
    setFormState((current) => ({ ...current, ...patch }));
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

  function submitSettings() {
    setMessage("");
    setCombinedTestMessage("");

    startTransition(async () => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formState),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setMessage(`${text.actions.saveFailed}: ${body?.error ?? text.actions.unknownError}`);
        return;
      }

      const body = (await response.json().catch(() => null)) as AppSettings | null;
      if (body?.feishuFieldMappingJson) {
        setFormState(body);
      }
      setMessage(text.actions.saved);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCombinedTestMessage("");
    void submitSettings();
  }

  function handleCombinedConnectionTest() {
    setMessage("");
    setCombinedTestMessage("");

    startCombinedTestTransition(async () => {
      const providerResult = await handleJsonRequest("/api/settings/test", text.actions.providerOk, text.actions.providerFailed);
      const feishuResult = await handleJsonRequest("/api/settings/test-feishu", text.actions.feishuOk, text.actions.feishuFailed);
      const summaryPrefix = providerResult.ok && feishuResult.ok ? text.actions.testAllOk : text.actions.testAllFailed;
      setCombinedTestMessage(`${summaryPrefix}: ${providerResult.message} | ${feishuResult.message}`);
    });
  }

  function handleFillRecommendedMapping() {
    patchSettings({ feishuFieldMappingJson: recommendedFeishuMappingJson });
    setCombinedTestMessage("");
    setMessage("");
  }

  function handleFillLegacyMapping() {
    patchSettings({ feishuFieldMappingJson: legacyFeishuMappingJson });
    setCombinedTestMessage("");
    setMessage("");
  }

  function handleFormatMapping() {
    try {
      patchSettings({ feishuFieldMappingJson: formatFeishuFieldMapping(formState.feishuFieldMappingJson) });
      setCombinedTestMessage("");
      setMessage("");
    } catch (error) {
      const reason = error instanceof Error ? error.message : text.actions.unknownError;
      setCombinedTestMessage(`${text.actions.testAllFailed}: ${text.actions.feishuFailed}: ${reason}`);
    }
  }

  return (
    <form className="settings-form-panel settings-form-shell settings-form-shell-liquid" onSubmit={handleSubmit}>
      <header className="panel settings-hero">
        <div className="settings-hero-copy">
          <h1 className="settings-hero-title">{text.hero.title}</h1>
          <p className="helper">{text.hero.subtitle}</p>
        </div>
      </header>

      <div className="settings-overview-grid settings-l-layout">
        <section className="panel settings-section settings-card settings-card-gemini is-info">
          <div className="settings-section-header settings-console-card-header">
            <h3>{text.sections.gemini}</h3>
          </div>
          <div className="settings-fields-grid">
            <label>
              <span>{text.labels.defaultApiKey}</span>
              <input
                type="password"
                value={formState.defaultApiKey}
                onChange={(event) => patchSettings({ defaultApiKey: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.defaultApiBaseUrl}</span>
              <input
                placeholder="https://your-relay-host.example"
                value={formState.defaultApiBaseUrl}
                onChange={(event) => patchSettings({ defaultApiBaseUrl: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.defaultApiVersion}</span>
              <input
                value={formState.defaultApiVersion}
                onChange={(event) => patchSettings({ defaultApiVersion: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.defaultTextModel}</span>
              <input
                value={formState.defaultTextModel}
                onChange={(event) => patchSettings({ defaultTextModel: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.defaultImageModel}</span>
              <input
                value={formState.defaultImageModel}
                onChange={(event) => patchSettings({ defaultImageModel: event.target.value })}
              />
            </label>
            <label className="settings-field-span-2">
              <span>{text.labels.defaultApiHeaders}</span>
              <textarea
                rows={6}
                placeholder='{"Authorization":"Bearer your-key"}'
                value={formState.defaultApiHeaders}
                onChange={(event) => patchSettings({ defaultApiHeaders: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="panel settings-section settings-card settings-card-feishu is-danger">
          <div className="settings-section-header settings-console-card-header">
            <h3>{text.sections.feishu}</h3>
          </div>
          <div className="settings-fields-grid settings-feishu-connection-grid">
            <label className="settings-checkbox-row settings-field-span-2">
              <input
                checked={formState.feishuSyncEnabled}
                onChange={(event) => patchSettings({ feishuSyncEnabled: event.target.checked })}
                type="checkbox"
              />
              <span>{text.labels.feishuSyncEnabled}</span>
            </label>
            <label>
              <span>{text.labels.feishuAppId}</span>
              <input value={formState.feishuAppId} onChange={(event) => patchSettings({ feishuAppId: event.target.value })} />
            </label>
            <label>
              <span>{text.labels.feishuAppSecret}</span>
              <input
                type="password"
                value={formState.feishuAppSecret}
                onChange={(event) => patchSettings({ feishuAppSecret: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.feishuBitableAppToken}</span>
              <input
                value={formState.feishuBitableAppToken}
                onChange={(event) => patchSettings({ feishuBitableAppToken: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.feishuBitableTableId}</span>
              <input
                value={formState.feishuBitableTableId}
                onChange={(event) => patchSettings({ feishuBitableTableId: event.target.value })}
              />
            </label>
            <label className="settings-field-span-2">
              <span>{text.labels.feishuUploadParentType}</span>
              <input
                value={formState.feishuUploadParentType}
                onChange={(event) => patchSettings({ feishuUploadParentType: event.target.value })}
              />
            </label>
          </div>
          <div className="settings-fields-grid">
            <label className="settings-field-span-2 settings-feishu-mapping-field">
              <div className="settings-field-toolbar">
                <span>{text.labels.feishuFieldMappingJson}</span>
                <div className="button-row settings-field-actions">
                  <button className="ghost-button mini-button" onClick={handleFillLegacyMapping} type="button">
                    {mappingTemplateText.legacy}
                  </button>
                  <button className="ghost-button mini-button" onClick={handleFillRecommendedMapping} type="button">
                    {mappingTemplateText.recommended}
                  </button>
                  <button className="ghost-button mini-button" onClick={handleFormatMapping} type="button">
                    {text.actions.formatMapping}
                  </button>
                </div>
              </div>
              <textarea
                rows={10}
                placeholder={recommendedFeishuMappingJson}
                value={formState.feishuFieldMappingJson}
                onChange={(event) => patchSettings({ feishuFieldMappingJson: event.target.value })}
              />
            </label>
          </div>
        </section>

        <section className="panel settings-section settings-card settings-card-storage is-accent">
          <div className="settings-section-header settings-console-card-header">
            <h3>{text.sections.storage}</h3>
          </div>
          <div className="settings-fields-grid settings-storage-grid">
            <label>
              <span>{text.labels.storageDir}</span>
              <input
                value={formState.storageDir}
                onChange={(event) => patchSettings({ storageDir: event.target.value })}
              />
            </label>
            <label>
              <span>{text.labels.maxConcurrency}</span>
              <input
                min={1}
                max={6}
                type="number"
                value={formState.maxConcurrency}
                onChange={(event) => patchSettings({ maxConcurrency: Number(event.target.value) || 1 })}
              />
            </label>
          </div>
        </section>
      </div>

      <section className="panel settings-actions-footer">
        <div className="settings-actions-status">
          {globalFeedback ? (
            <p className={`helper settings-feedback settings-actions-feedback ${globalFeedbackTone}`}>{globalFeedback}</p>
          ) : (
            <p className="helper settings-actions-feedback">{text.hero.idleFeedback}</p>
          )}
        </div>
        <div className="settings-actions-row">
          <button
            className="primary-button settings-action-button settings-action-button-test"
            disabled={isPending || isTestingCombined}
            onClick={handleCombinedConnectionTest}
            type="button"
          >
            {isTestingCombined ? text.actions.testingAllConnections : text.actions.testAllConnections}
          </button>
          <button
            className="primary-button settings-action-button settings-action-button-save"
            disabled={isPending || isTestingCombined}
            type="submit"
          >
            {isPending ? text.actions.saving : text.actions.save}
          </button>
        </div>
      </section>
    </form>
  );
}
