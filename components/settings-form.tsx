"use client";

import { type FormEvent, useMemo, useState, useTransition } from "react";

import {
  formatFeishuFieldMapping,
  getLegacyFeishuFieldMappingJson,
  getRecommendedFeishuFieldMappingJson,
} from "@/lib/feishu-field-mapping";
import type { AppSettings, UiLanguage } from "@/lib/types";

export function SettingsForm({ initialSettings, language }: { initialSettings: AppSettings; language: UiLanguage }) {
  const [formState, setFormState] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [providerTestMessage, setProviderTestMessage] = useState("");
  const [feishuTestMessage, setFeishuTestMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isTestingProvider, startProviderTestTransition] = useTransition();
  const [isTestingFeishu, startFeishuTestTransition] = useTransition();
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
            guides: {
              title: "接入说明",
              gemini: [
                "官方 Gemini：只填 API Key，Base URL 留空。",
                "兼容中转：填写 API Key 和 Base URL，必要时补充请求头 JSON。",
                "保存后先点“测试 Gemini / 中转”确认可用。",
              ],
              feishu: [
                "在飞书开放平台应用里获取 App ID 和 App Secret。",
                "从多维表格链接获取 App Token 和 Table ID。",
                "推荐先保留生成状态、原图、生成图、提示词，再测试飞书连接。",
              ],
              storage: [
                "素材目录用于保存原图、参考图和生成结果。",
                "并发任务数越高，占用的模型请求和本地资源越多。",
                "建议先用 2 到 3，稳定后再逐步提高。",
              ],
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
            actions: {
              save: "保存设置",
              saving: "保存中...",
              saved: "设置已保存",
              saveFailed: "保存失败。",
              testProvider: "测试 Gemini / 中转",
              testingProvider: "测试中...",
              providerOk: "Gemini / 中转连接成功",
              providerFailed: "Gemini / 中转连接失败",
              testFeishu: "测试飞书连接",
              testingFeishu: "测试中...",
              feishuOk: "飞书连接成功",
              feishuFailed: "飞书连接失败",
              unknownError: "未知错误",
              fillRecommendedMapping: "填入推荐模板",
              formatMapping: "格式化映射",
            },
            hints: {
              baseUrl: "留空表示使用 Google 官方 Gemini API；如使用中转站，请填写对方提供的 base_url。",
              headers: '示例：{"Authorization":"Bearer your-key"}。如不需要额外请求头，可留空。',
              version: "大多数 Gemini 兼容中转使用 v1beta。",
              storageDir: "建议使用本机稳定磁盘路径，方便统一备份与迁移。",
              maxConcurrency: "并发越高，任务吞吐越快，但也更容易触发中转限流或占满本机带宽。",
              saveSummary: "先分别测试 Gemini / 飞书，再统一保存整页设置。",
              feishuEnable: "开启后，生成成功的图片会自动创建飞书多维表格记录，并上传到图片字段。",
              feishuToken: "可在飞书开放平台和多维表格链接中获取。",
              feishuParentType: "默认使用 bitable_image。若你的应用要求不同，可在这里修改。",
              feishuMapping:
                "只会写入你配置过的字段。飞书第一列不要使用附件/图片字段，建议顺序设置为：生成状态、原图、生成图、提示词。旧表如需继续保留，也仍兼容 platform / country 等旧字段。",
              feishuSupportedFields:
                "支持字段键：title、sourceImage、image、mode、platform、country、language、promptTranslation、promptOptimization、typeSummary、ratioSummary、resolutionSummary、sizeSummary、statusSummary、ratio、resolution、requestedSize、actualSize、status、prompt、negativePrompt、createdAt、jobId、itemId。",
            },
          }
        : {
            sections: {
              gemini: "Gemini / relay settings",
              feishu: "Feishu Bitable sync",
              storage: "Assets and queue",
            },
            guides: {
              title: "Quick setup",
              gemini: [
                "Official Gemini: fill only the API key and leave Base URL empty.",
                "Relay mode: fill API key and Base URL, then add headers JSON only if required.",
                'Save first, then run "Test Gemini / relay".',
              ],
              feishu: [
                "Get the App ID and App Secret from the Feishu developer console.",
                "Get the App Token and Table ID from your Bitable URL.",
                "Start with generation status, source image, generated image, and prompt before testing the connection.",
              ],
              storage: [
                "The asset directory stores source images, references, and generated outputs.",
                "Higher concurrency increases throughput but also uses more relay quota and local resources.",
                "Start with 2 or 3 and raise it only after the workflow stays stable.",
              ],
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
            actions: {
              save: "Save settings",
              saving: "Saving...",
              saved: "Settings saved",
              saveFailed: "Save failed.",
              testProvider: "Test Gemini / relay",
              testingProvider: "Testing...",
              providerOk: "Gemini / relay connection succeeded",
              providerFailed: "Gemini / relay connection failed",
              testFeishu: "Test Feishu connection",
              testingFeishu: "Testing...",
              feishuOk: "Feishu connection succeeded",
              feishuFailed: "Feishu connection failed",
              unknownError: "Unknown error",
              fillRecommendedMapping: "Use recommended template",
              formatMapping: "Format mapping",
            },
            hints: {
              baseUrl: "Leave blank for the official Google Gemini API. For a relay, paste the provider's base_url here.",
              headers: 'Example: {"Authorization":"Bearer your-key"}. Leave empty if your relay does not require extra headers.',
              version: "Most Gemini-compatible relays use v1beta.",
              storageDir: "Use a stable local disk path so assets are easy to back up and migrate.",
              maxConcurrency: "Higher concurrency speeds up batches, but it also increases the chance of relay throttling or local resource pressure.",
              saveSummary: "Test Gemini and Feishu in their own cards first, then save the whole settings page.",
              feishuEnable: "When enabled, successful generated images will automatically create Feishu Bitable records and upload to the image field.",
              feishuToken: "You can find these in the Feishu developer console and the Bitable URL.",
              feishuParentType: "Defaults to bitable_image. Change it only if your Feishu app requires another upload parent type.",
              feishuMapping:
                "Only mapped fields will be written. Do not use an attachment or image field as the first Feishu column. Recommended order: generation status, source image, generated image, prompt. Older tables can still keep legacy fields such as platform / country if needed.",
              feishuSupportedFields:
                "Supported keys: title, sourceImage, image, mode, platform, country, language, promptTranslation, promptOptimization, typeSummary, ratioSummary, resolutionSummary, sizeSummary, statusSummary, ratio, resolution, requestedSize, actualSize, status, prompt, negativePrompt, createdAt, jobId, itemId.",
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

  function patchSettings(patch: Partial<AppSettings>) {
    setFormState((current) => ({ ...current, ...patch }));
  }

  async function handleJsonRequest(
    url: string,
    onMessage: (nextMessage: string) => void,
    okPrefix: string,
    failedPrefix: string,
  ) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formState),
    });

    const body = (await response.json().catch(() => null)) as { error?: string; result?: string } | null;
    if (!response.ok) {
      onMessage(`${failedPrefix}: ${body?.error ?? text.actions.unknownError}`);
      return;
    }

    onMessage(`${okPrefix}: ${body?.result ?? "OK"}`);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

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
        setMessage(body?.error ?? text.actions.saveFailed);
        return;
      }

      const body = (await response.json().catch(() => null)) as AppSettings | null;
      if (body?.feishuFieldMappingJson) {
        setFormState(body);
      }
      setMessage(text.actions.saved);
    });
  }

  function handleProviderTest() {
    setProviderTestMessage("");
    startProviderTestTransition(async () => {
      await handleJsonRequest(
        "/api/settings/test",
        setProviderTestMessage,
        text.actions.providerOk,
        text.actions.providerFailed,
      );
    });
  }

  function handleFeishuTest() {
    setFeishuTestMessage("");
    startFeishuTestTransition(async () => {
      await handleJsonRequest(
        "/api/settings/test-feishu",
        setFeishuTestMessage,
        text.actions.feishuOk,
        text.actions.feishuFailed,
      );
    });
  }

  function handleFillRecommendedMapping() {
    patchSettings({ feishuFieldMappingJson: recommendedFeishuMappingJson });
    setFeishuTestMessage("");
    setMessage("");
  }

  function handleFillLegacyMapping() {
    patchSettings({ feishuFieldMappingJson: legacyFeishuMappingJson });
    setFeishuTestMessage("");
    setMessage("");
  }

  function handleFormatMapping() {
    try {
      patchSettings({ feishuFieldMappingJson: formatFeishuFieldMapping(formState.feishuFieldMappingJson) });
      setFeishuTestMessage("");
      setMessage("");
    } catch (error) {
      setFeishuTestMessage(error instanceof Error ? error.message : text.actions.unknownError);
    }
  }

  return (
    <form className="settings-form-panel settings-form-shell settings-form-shell-liquid" onSubmit={handleSubmit}>
      <div className="settings-overview-grid">
        <section className="panel settings-section settings-card is-info">
          <div className="settings-section-header">
            <h3>{text.sections.gemini}</h3>
            <aside className="settings-guide-card is-info">
              <strong>{text.guides.title}</strong>
              <ul>
                {text.guides.gemini.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </div>
          <div className="settings-fields-grid">
            <label className="settings-field-span-2">
              <span>{text.labels.defaultApiKey}</span>
              <input
                type="password"
                value={formState.defaultApiKey}
                onChange={(event) => patchSettings({ defaultApiKey: event.target.value })}
              />
            </label>
            <label className="settings-field-span-2">
              <span>{text.labels.defaultApiBaseUrl}</span>
              <input
                placeholder="https://your-relay-host.example"
                value={formState.defaultApiBaseUrl}
                onChange={(event) => patchSettings({ defaultApiBaseUrl: event.target.value })}
              />
              <small className="helper">{text.hints.baseUrl}</small>
            </label>
            <label>
              <span>{text.labels.defaultApiVersion}</span>
              <input
                value={formState.defaultApiVersion}
                onChange={(event) => patchSettings({ defaultApiVersion: event.target.value })}
              />
              <small className="helper">{text.hints.version}</small>
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
                rows={4}
                placeholder='{"Authorization":"Bearer your-key"}'
                value={formState.defaultApiHeaders}
                onChange={(event) => patchSettings({ defaultApiHeaders: event.target.value })}
              />
              <small className="helper">{text.hints.headers}</small>
            </label>
          </div>
          <div className="settings-card-footer">
            <button className="ghost-button" disabled={isTestingProvider} onClick={handleProviderTest} type="button">
              {isTestingProvider ? text.actions.testingProvider : text.actions.testProvider}
            </button>
            {providerTestMessage ? <p className="helper settings-feedback is-info">{providerTestMessage}</p> : null}
          </div>
        </section>

        <section className="panel settings-section settings-card settings-card-compact is-accent">
          <div className="settings-section-header">
            <h3>{text.sections.storage}</h3>
            <aside className="settings-guide-card is-accent">
              <strong>{text.guides.title}</strong>
              <ul>
                {text.guides.storage.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </div>
          <div className="settings-fields-grid">
            <label className="settings-field-span-2">
              <span>{text.labels.storageDir}</span>
              <input
                value={formState.storageDir}
                onChange={(event) => patchSettings({ storageDir: event.target.value })}
              />
              <small className="helper">{text.hints.storageDir}</small>
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
              <small className="helper">{text.hints.maxConcurrency}</small>
            </label>
          </div>
        </section>

        <section className="panel settings-section settings-card settings-card-wide is-danger">
          <div className="settings-section-header">
            <h3>{text.sections.feishu}</h3>
            <aside className="settings-guide-card is-danger">
              <strong>{text.guides.title}</strong>
              <ul>
                {text.guides.feishu.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </aside>
          </div>
          <label className="settings-checkbox-row">
            <input
              checked={formState.feishuSyncEnabled}
              onChange={(event) => patchSettings({ feishuSyncEnabled: event.target.checked })}
              type="checkbox"
            />
            <span>{text.labels.feishuSyncEnabled}</span>
          </label>
          <small className="helper">{text.hints.feishuEnable}</small>
          <div className="settings-fields-grid">
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
              <small className="helper">{text.hints.feishuToken}</small>
            </label>
            <label className="settings-field-span-2">
              <span>{text.labels.feishuUploadParentType}</span>
              <input
                value={formState.feishuUploadParentType}
                onChange={(event) => patchSettings({ feishuUploadParentType: event.target.value })}
              />
              <small className="helper">{text.hints.feishuParentType}</small>
            </label>
            <label className="settings-field-span-2">
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
                rows={12}
                placeholder={recommendedFeishuMappingJson}
                value={formState.feishuFieldMappingJson}
                onChange={(event) => patchSettings({ feishuFieldMappingJson: event.target.value })}
              />
              <small className="helper">{text.hints.feishuMapping}</small>
              <small className="helper">{text.hints.feishuSupportedFields}</small>
            </label>
          </div>
          <div className="settings-card-footer">
            <button className="ghost-button" disabled={isTestingFeishu} onClick={handleFeishuTest} type="button">
              {isTestingFeishu ? text.actions.testingFeishu : text.actions.testFeishu}
            </button>
            {feishuTestMessage ? <p className="helper settings-feedback is-danger">{feishuTestMessage}</p> : null}
          </div>
        </section>
      </div>

      <section className="panel settings-submit-panel is-accent">
        <div>
          <strong>{text.actions.save}</strong>
          <p className="helper">{text.hints.saveSummary}</p>
          {message ? <p className="helper success-text settings-feedback is-success">{message}</p> : null}
        </div>
        <button className="primary-button" disabled={isPending} type="submit">
          {isPending ? text.actions.saving : text.actions.save}
        </button>
      </section>
    </form>
  );
}
