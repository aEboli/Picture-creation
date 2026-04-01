"use client";

import { type ChangeEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ImageLightbox } from "@/components/image-lightbox";
import { DEFAULT_AGENT_SETTINGS_STORE } from "@/lib/agent-settings";
import type { AgentProfileSettings, AgentSettingsStore } from "@/lib/types";
import {
  normalizeAgentHistoryMessages,
  readAgentHistoryBucket,
  readCreateDraftIdFromDraftJson,
  type CreateAgentMapDetail,
  type CreateAgentMappedFields,
  type PersistedCreateAgentMessage,
  writeAgentHistoryBucket,
} from "@/lib/create-agent-history";

type AgentType = "image-analyst" | "prompt-engineer";

type AgentMessage = PersistedCreateAgentMessage;

const CREATE_FORM_MAPPING_EVENT = "create-agent:map-to-form";
const CREATE_AGENT_DRAFT_CONTEXT_EVENT = "create-agent:draft-context";
const CREATE_AGENT_HISTORY_KEY = "commerce-image-studio.create-agent-history.v1";
const CREATE_JOB_DRAFT_KEY = "commerce-image-studio.create-draft.v1";

const AGENT_IDS: AgentType[] = ["image-analyst", "prompt-engineer"];

function hasMappedFields(fields?: CreateAgentMappedFields) {
  if (!fields) {
    return false;
  }

  return Object.values(fields).some((value) => typeof value === "string" && value.trim().length > 0);
}

function hasPromptSuggestions(promptSuggestions?: string[]) {
  if (!Array.isArray(promptSuggestions)) {
    return false;
  }

  return promptSuggestions.some((value) => typeof value === "string" && value.trim().length > 0);
}

function hasMappableResult(input: { fields?: CreateAgentMappedFields; promptSuggestions?: string[] }) {
  return hasMappedFields(input.fields) || hasPromptSuggestions(input.promptSuggestions);
}

function toConversationHistory(messages: AgentMessage[]) {
  return messages.map((message) => ({
    role: message.role === "agent" ? "assistant" : "user",
    text: message.text || (message.previewDataUrl ? "Image attached." : ""),
  }));
}

function formatMessageTime(createdAt: string) {
  try {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function historyItemPreview(message: AgentMessage) {
  return message.text.length > 96 ? `${message.text.slice(0, 96)}...` : message.text;
}

async function createImagePreviewDataUrl(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Image preview failed."));
      nextImage.src = objectUrl;
    });

    const longestSide = 180;
    const scale = Math.min(1, longestSide / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function CreateAgentPanel() {
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState<AgentType>("image-analyst");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [inputText, setInputText] = useState("");
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [historyView, setHistoryView] = useState<"chat" | "history" | "settings">("chat");
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [historyReady, setHistoryReady] = useState(false);
  const [pendingHistoryMapDetail, setPendingHistoryMapDetail] = useState<CreateAgentMapDetail | null>(null);
  const [pendingPreviewDataUrl, setPendingPreviewDataUrl] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);
  const [agentSettings, setAgentSettings] = useState<AgentSettingsStore>(DEFAULT_AGENT_SETTINGS_STORE);
  const [settingsDraft, setSettingsDraft] = useState<AgentProfileSettings>(DEFAULT_AGENT_SETTINGS_STORE["image-analyst"]);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [isSettingsLoading, setIsSettingsLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSettingsDirty, setIsSettingsDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeAgent = useMemo(() => agentSettings[agent] ?? DEFAULT_AGENT_SETTINGS_STORE[agent], [agent, agentSettings]);
  const historyMessages = useMemo(() => [...messages].reverse(), [messages]);
  const messagePreviewItems = useMemo(
    () => {
      const pendingItems = pendingPreviewDataUrl
        ? [
            {
              alt: imageFile?.name || "上传图片预览",
              label: imageFile?.name || "上传图片预览",
              src: pendingPreviewDataUrl,
            },
          ]
        : [];

      const messageItems = messages
        .filter((message) => message.previewDataUrl)
        .map((message) => ({
          alt: message.text || "图片消息",
          label: message.text || "图片消息",
          src: message.previewDataUrl!,
        }));

      return pendingItems.concat(messageItems);
    },
    [imageFile?.name, messages, pendingPreviewDataUrl],
  );
  const pendingHistorySummary = pendingHistoryMapDetail
    ? historyItemPreview({
        id: "pending",
        role: "agent",
        agent: pendingHistoryMapDetail.agentType,
        text:
          pendingHistoryMapDetail.fields?.productName ||
          pendingHistoryMapDetail.promptSuggestions?.[0] ||
          "历史消息",
        createdAt: new Date().toISOString(),
        fields: pendingHistoryMapDetail.fields,
        promptSuggestions: pendingHistoryMapDetail.promptSuggestions,
      })
    : "";

  useEffect(() => {
    setMounted(true);
    const initialDraftId = readCreateDraftIdFromDraftJson(window.localStorage.getItem(CREATE_JOB_DRAFT_KEY));
    setCurrentDraftId(initialDraftId);

    function handleDraftContext(event: Event) {
      const nextDraftId = (event as CustomEvent<{ draftId?: string }>).detail?.draftId?.trim() || null;
      setCurrentDraftId((current) => {
        if (current && nextDraftId && current !== nextDraftId) {
          setImageFile(null);
          setPendingPreviewDataUrl(null);
        }

        return nextDraftId;
      });
      setHistoryView("chat");
      setPendingHistoryMapDetail(null);
      setErrorMessage("");
    }

    window.addEventListener(CREATE_AGENT_DRAFT_CONTEXT_EVENT, handleDraftContext as EventListener);
    return () => {
      window.removeEventListener(CREATE_AGENT_DRAFT_CONTEXT_EVENT, handleDraftContext as EventListener);
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    let disposed = false;
    setIsSettingsLoading(true);

    void fetch("/api/agent-settings")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load agent settings.");
        }
        return (await response.json()) as AgentSettingsStore;
      })
      .then((nextStore) => {
        if (disposed) {
          return;
        }
        setAgentSettings(nextStore);
      })
      .catch(() => {
        if (disposed) {
          return;
        }
        setAgentSettings(DEFAULT_AGENT_SETTINGS_STORE);
      })
      .finally(() => {
        if (!disposed) {
          setIsSettingsLoading(false);
        }
      });

    return () => {
      disposed = true;
    };
  }, [mounted]);

  useEffect(() => {
    setSettingsDraft(agentSettings[agent] ?? DEFAULT_AGENT_SETTINGS_STORE[agent]);
    setIsSettingsDirty(false);
    setSettingsMessage("");
  }, [agent, agentSettings]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    setHistoryReady(false);

    if (!currentDraftId) {
      setMessages([]);
      setHistoryReady(true);
      return;
    }

    const rawHistory = window.localStorage.getItem(CREATE_AGENT_HISTORY_KEY);
    setMessages(readAgentHistoryBucket(rawHistory, currentDraftId, agent));
    setHistoryReady(true);
  }, [agent, currentDraftId, mounted]);

  useEffect(() => {
    if (!mounted || !historyReady || !currentDraftId) {
      return;
    }

    const nextRawHistory = writeAgentHistoryBucket(
      window.localStorage.getItem(CREATE_AGENT_HISTORY_KEY),
      currentDraftId,
      agent,
      normalizeAgentHistoryMessages(messages),
    );
    window.localStorage.setItem(CREATE_AGENT_HISTORY_KEY, nextRawHistory);
  }, [agent, currentDraftId, historyReady, messages, mounted]);

  function confirmDiscardSettingsChanges() {
    if (!isSettingsDirty || historyView !== "settings") {
      return true;
    }

    return window.confirm("当前智能体设置尚未保存，确定要放弃这些修改吗？");
  }

  function handleAgentChange(nextAgent: AgentType) {
    if (nextAgent === agent) {
      return;
    }

    if (!confirmDiscardSettingsChanges()) {
      return;
    }

    setAgent(nextAgent);
  }

  function handleSettingsDraftChange<K extends keyof AgentProfileSettings>(key: K, value: AgentProfileSettings[K]) {
    setSettingsDraft((current) => ({
      ...current,
      [key]: value,
    }));
    setIsSettingsDirty(true);
    setSettingsMessage("");
  }

  async function handleSaveAgentSettings() {
    setSettingsMessage("");
    setIsSavingSettings(true);

    try {
      const response = await fetch("/api/agent-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          [agent]: settingsDraft,
        }),
      });
      const body = (await response.json().catch(() => null)) as AgentSettingsStore | { error?: string } | null;

      if (!response.ok || !body || "error" in body) {
        throw new Error(body && "error" in body ? body.error || "保存失败" : "保存失败");
      }

      const nextStore = body as AgentSettingsStore;
      setAgentSettings(nextStore);
      setSettingsDraft(nextStore[agent]);
      setIsSettingsDirty(false);
      setSettingsMessage("智能体设置已保存");
      setHistoryView("chat");
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSavingSettings(false);
    }
  }

  function handleResetAgentSettings() {
    setSettingsDraft(DEFAULT_AGENT_SETTINGS_STORE[agent]);
    setIsSettingsDirty(true);
    setSettingsMessage("");
  }

  async function appendAgentMessage(nextInput: string) {
    const trimmedInput = nextInput.trim();
    if (!trimmedInput && !imageFile) {
      setErrorMessage("请先输入文本，或上传 1 张图片。");
      return;
    }
    const fallbackPromptText = trimmedInput || (imageFile ? activeAgent.openingPrompt : "");

    setErrorMessage("");
    setIsSending(true);
    setHistoryView("chat");

    const nonce = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const nextUserMessage: AgentMessage = {
      id: `user-${nonce}`,
      role: "user",
      agent,
      text: fallbackPromptText,
      createdAt,
      ...(pendingPreviewDataUrl ? { previewDataUrl: pendingPreviewDataUrl } : {}),
    };
    const nextConversationMessages = [...messages, nextUserMessage];

    setMessages(nextConversationMessages);
    setInputText("");
    setImageFile(null);
    setPendingPreviewDataUrl(null);

    try {
      const formData = new FormData();
      formData.append("agentType", agent);
      formData.append("userText", fallbackPromptText);
      formData.append("conversationHistory", JSON.stringify(toConversationHistory(nextConversationMessages)));

      if (imageFile) {
        formData.append("image", imageFile);
      }

      const response = await fetch("/api/agent-chat", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as
        | {
            assistantText?: string;
            fieldMapping?: CreateAgentMappedFields;
            promptSuggestions?: string[];
            error?: string;
          }
        | null;

      if (!response.ok || !body || body.error) {
        throw new Error(body?.error || "智能体暂时不可用，请稍后重试。");
      }

      setMessages((current) => [
        ...current,
        {
          id: `agent-${nonce}`,
          role: "agent",
          agent,
          text: body.assistantText?.trim() || "智能体没有返回可用内容。",
          fields: body.fieldMapping,
          promptSuggestions: body.promptSuggestions,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "智能体暂时不可用，请稍后重试。");
    } finally {
      setIsSending(false);
    }
  }

  function handleMapToForm(detail: CreateAgentMapDetail) {
    if (!hasMappableResult(detail)) {
      return;
    }

    const { agentType, fields, promptSuggestions } = detail;
    setPendingHistoryMapDetail(null);
    window.dispatchEvent(new CustomEvent(CREATE_FORM_MAPPING_EVENT, { detail: { agentType, fields, promptSuggestions } }));
  }

  function handleHistoryMapSelect(message: AgentMessage) {
    setPendingHistoryMapDetail({
      agentType: message.agent,
      fields: message.fields,
      promptSuggestions: message.promptSuggestions,
    });
    setHistoryView("chat");
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setPendingPreviewDataUrl(file ? await createImagePreviewDataUrl(file) : null);
    event.target.value = "";
  }

  function handleRemovePendingImage() {
    setImageFile(null);
    setPendingPreviewDataUrl(null);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void appendAgentMessage(inputText);
    }
  }

  return (
    <>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className={open ? "create-agent-entry is-active" : "create-agent-entry"}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        智能体
      </button>

      {mounted && open
        ? createPortal(
            <>
              <div className="create-agent-overlay-backdrop" onClick={() => setOpen(false)} role="presentation" />

              <section
                aria-label="创作台智能体侧窗"
                aria-modal="false"
                className="create-agent-overlay-panel"
                role="dialog"
              >
                <header className="create-agent-overlay-header">
                  <strong>智能体</strong>
                  <div className="create-agent-header-actions">
                    <button
                      className={historyView === "settings" ? "create-agent-settings-button is-active" : "create-agent-settings-button"}
                      onClick={() => {
                        if (!confirmDiscardSettingsChanges()) {
                          return;
                        }
                        setHistoryView((current) => (current === "settings" ? "chat" : "settings"));
                      }}
                      type="button"
                    >
                      设置
                    </button>
                    <button
                      className={historyView === "history" ? "create-agent-history-button is-active" : "create-agent-history-button"}
                      onClick={() => {
                        if (!confirmDiscardSettingsChanges()) {
                          return;
                        }
                        setHistoryView((current) => (current === "history" ? "chat" : "history"));
                      }}
                      type="button"
                    >
                      历史记录
                    </button>
                    <button
                      className="create-agent-close-button"
                      onClick={() => {
                        if (!confirmDiscardSettingsChanges()) {
                          return;
                        }
                        setOpen(false);
                      }}
                      type="button"
                    >
                      关闭
                    </button>
                  </div>
                </header>

                <div className="create-agent-toolbar">
                  <label className="create-agent-select-wrap">
                    <span>选择智能体</span>
                    <select value={agent} onChange={(event) => handleAgentChange(event.target.value as AgentType)}>
                      {AGENT_IDS.map((agentId) => (
                        <option key={agentId} value={agentId}>
                          {agentSettings[agentId]?.name ?? DEFAULT_AGENT_SETTINGS_STORE[agentId].name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div aria-live="polite" className="create-agent-body">
                  {historyView === "settings" ? (
                    <div className="create-agent-settings-form">
                      <div className="create-agent-settings-head">
                        <strong>智能体设置</strong>
                        <button className="ghost-button mini-button" onClick={() => setHistoryView("chat")} type="button">
                          返回聊天
                        </button>
                      </div>
                      <div className="create-agent-settings-scroll">
                        <label className="create-agent-settings-field">
                          <span>名称</span>
                          <input
                            value={settingsDraft.name}
                            onChange={(event) => handleSettingsDraftChange("name", event.target.value)}
                          />
                        </label>
                        <label className="create-agent-settings-field is-description">
                          <span>说明</span>
                          <textarea
                            rows={3}
                            value={settingsDraft.description}
                            onChange={(event) => handleSettingsDraftChange("description", event.target.value)}
                          />
                        </label>
                        <label className="create-agent-settings-field is-system-prompt">
                          <span>系统提示词</span>
                          <textarea
                            rows={7}
                            value={settingsDraft.systemPrompt}
                            onChange={(event) => handleSettingsDraftChange("systemPrompt", event.target.value)}
                          />
                        </label>
                        <label className="create-agent-settings-field">
                          <span>开场白示例</span>
                          <input
                            value={settingsDraft.openingPrompt}
                            onChange={(event) => handleSettingsDraftChange("openingPrompt", event.target.value)}
                          />
                        </label>
                      </div>
                      <div className="create-agent-settings-footer">
                        <div className="create-agent-settings-feedback">
                          {settingsMessage ? <p className="create-agent-settings-message">{settingsMessage}</p> : null}
                        </div>
                        <div className="create-agent-settings-actions">
                          <button className="ghost-button mini-button" onClick={handleResetAgentSettings} type="button">
                            恢复默认
                          </button>
                          <button className="primary-button mini-button" disabled={isSavingSettings || isSettingsLoading} onClick={() => void handleSaveAgentSettings()} type="button">
                            {isSavingSettings ? "保存中..." : "保存"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : historyView === "history" ? (
                    <div className="create-agent-history-list">
                      <div className="create-agent-history-head">
                        <strong>历史记录</strong>
                        <button className="ghost-button mini-button" onClick={() => setHistoryView("chat")} type="button">
                          返回聊天
                        </button>
                      </div>
                      {historyMessages.length ? (
                        historyMessages.map((message) => (
                          <article className={`create-agent-history-item is-${message.role}`} key={`history-${message.id}`}>
                            <div className="create-agent-history-item-head">
                              <strong>{message.role === "user" ? "你" : agentSettings[message.agent]?.name ?? DEFAULT_AGENT_SETTINGS_STORE[message.agent].name}</strong>
                              <span>{formatMessageTime(message.createdAt)}</span>
                            </div>
                            {message.previewDataUrl ? (
                              <button
                                className="create-agent-history-image"
                                onClick={() => setLightboxIndex(messages.findIndex((item) => item.id === message.id) + (pendingPreviewDataUrl ? 1 : 0))}
                                type="button"
                              >
                                <img alt={message.text || "历史图片"} src={message.previewDataUrl} />
                              </button>
                            ) : (
                              <p>{historyItemPreview(message)}</p>
                            )}
                            {message.previewDataUrl && message.text ? <p>{historyItemPreview(message)}</p> : null}
                            {message.role === "agent" && hasMappableResult(message) ? (
                              <button className="create-agent-map-button" onClick={() => handleHistoryMapSelect(message)} type="button">
                                映射到表单
                              </button>
                            ) : null}
                          </article>
                        ))
                      ) : (
                        <p className="create-agent-empty-hint">当前草稿还没有历史记录。</p>
                      )}
                    </div>
                  ) : (
                    <>
                      {pendingHistoryMapDetail ? (
                        <div className="create-agent-pending-map-card">
                          <div>
                            <strong>历史消息已选中</strong>
                            <p>{pendingHistorySummary || "可以将这条历史回复重新映射到表单。"}</p>
                          </div>
                          <div className="create-agent-pending-map-actions">
                            <button className="ghost-button mini-button" onClick={() => setPendingHistoryMapDetail(null)} type="button">
                              取消
                            </button>
                            <button className="create-agent-map-button" onClick={() => handleMapToForm(pendingHistoryMapDetail)} type="button">
                              映射到表单
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="create-agent-message-list">
                        {messages.length === 0 ? (
                          <p className="create-agent-empty-hint">从这里开始对话，历史会按当前商品草稿自动保存。</p>
                        ) : null}
                        {messages.map((message) => (
                          <article className={`create-agent-message is-${message.role}`} key={message.id}>
                            <div className="create-agent-message-meta">
                              <strong>{message.role === "user" ? "你" : agentSettings[message.agent]?.name ?? DEFAULT_AGENT_SETTINGS_STORE[message.agent].name}</strong>
                              <span>{formatMessageTime(message.createdAt)}</span>
                            </div>
                            <div className="create-agent-message-bubble">
                              {message.previewDataUrl ? (
                                <button
                                  className="create-agent-message-image"
                                  onClick={() => setLightboxIndex(messages.findIndex((item) => item.id === message.id) + (pendingPreviewDataUrl ? 1 : 0))}
                                  type="button"
                                >
                                  <img alt={message.text || "图片消息"} src={message.previewDataUrl} />
                                </button>
                              ) : null}
                              {message.text ? <p>{message.text}</p> : null}
                            </div>
                            {message.role === "agent" && hasMappableResult(message) ? (
                              <button
                                className="create-agent-map-button"
                                onClick={() =>
                                  handleMapToForm({
                                    agentType: message.agent,
                                    fields: message.fields,
                                    promptSuggestions: message.promptSuggestions,
                                  })}
                                type="button"
                              >
                                映射到表单
                              </button>
                            ) : null}
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="create-agent-footer">
                  {pendingPreviewDataUrl ? (
                    <div className="create-agent-upload-preview-frame">
                      <button className="create-agent-upload-preview" onClick={() => setLightboxIndex(0)} type="button">
                        <img alt={imageFile?.name || "上传图片预览"} src={pendingPreviewDataUrl} />
                      </button>
                      <button
                        aria-label="移除已选图片"
                        className="create-agent-upload-remove"
                        onClick={handleRemovePendingImage}
                        type="button"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  {errorMessage ? <p className="create-agent-error-text">{errorMessage}</p> : null}
                  <div className="create-agent-input-bar">
                    <input accept="image/*" hidden onChange={handleImageChange} ref={fileInputRef} type="file" />
                    <button className="create-agent-upload-trigger" onClick={() => fileInputRef.current?.click()} type="button">
                      +
                    </button>
                    <textarea
                      className="create-agent-input-control"
                      onChange={(event) => setInputText(event.target.value)}
                      onKeyDown={handleInputKeyDown}
                      placeholder={activeAgent.openingPrompt}
                      rows={1}
                      value={inputText}
                    />
                    <button className="create-agent-send-button" disabled={isSending} onClick={() => void appendAgentMessage(inputText)} type="button">
                      {isSending ? "处理中..." : "发送"}
                    </button>
                  </div>
                </div>
              </section>
              <ImageLightbox currentIndex={lightboxIndex} items={messagePreviewItems} onClose={() => setLightboxIndex(-1)} />
            </>,
            document.body,
          )
        : null}
    </>
  );
}
