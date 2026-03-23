"use client";

import { useEffect, useMemo, useState } from "react";

import { COUNTRIES, IMAGE_TYPE_OPTIONS, OUTPUT_LANGUAGES, PLATFORMS, PRODUCT_CATEGORIES } from "@/lib/constants";
import type { TemplateFilters, TemplateInput, TemplateRecord, UiLanguage } from "@/lib/types";

type FormState = TemplateInput;

function copyFor(language: UiLanguage) {
  return language === "zh"
    ? {
        subtitle: "模板现在会实际参与生成流程。你可以按国家、语言、平台、品类和图片类型维护规则。",
        filters: "筛选模板",
        editor: "模板编辑器",
        create: "新建模板",
        createHint: "默认模板只读。需要调整时，请先复制为自定义模板。",
        refresh: "刷新",
        save: "保存模板",
        saving: "保存中...",
        reset: "重置",
        cancelEdit: "取消编辑",
        search: "搜索模板名 / 提示词 / 文案策略",
        source: "来源",
        sourceAll: "全部",
        sourceDefault: "默认",
        sourceCustom: "自定义",
        noData: "当前筛选下没有模板。",
        total: "模板总数",
        defaults: "默认模板",
        custom: "自定义模板",
        imageTypes: "图片类型",
        platforms: "平台覆盖",
        promptTemplate: "提示词策略",
        copyTemplate: "文案策略",
        layoutStyle: "版式策略",
        duplicate: "复制为自定义",
        edit: "编辑",
        remove: "删除",
        readOnly: "默认模板（只读）",
        customBadge: "自定义模板",
        wildcard: "全部适用",
        formName: "模板名",
        formCountry: "国家",
        formLanguage: "语言",
        formPlatform: "平台",
        formCategory: "品类",
        formImageType: "图片类型",
        successCreated: "模板已创建。",
        successUpdated: "模板已更新。",
        successDeleted: "模板已删除。",
        deleteConfirm: "确定删除这个自定义模板吗？",
      }
    : {
        subtitle: "Templates now participate in generation. Maintain rules by country, language, platform, category, and image type.",
        filters: "Filter templates",
        editor: "Template editor",
        create: "New template",
        createHint: "Default templates are read-only. Duplicate one first when you need a custom variant.",
        refresh: "Refresh",
        save: "Save template",
        saving: "Saving...",
        reset: "Reset",
        cancelEdit: "Cancel edit",
        search: "Search by name / prompt / copy strategy",
        source: "Source",
        sourceAll: "All",
        sourceDefault: "Default",
        sourceCustom: "Custom",
        noData: "No templates match the current filters.",
        total: "Total templates",
        defaults: "Default templates",
        custom: "Custom templates",
        imageTypes: "Image types",
        platforms: "Platforms",
        promptTemplate: "Prompt strategy",
        copyTemplate: "Copy strategy",
        layoutStyle: "Layout style",
        duplicate: "Duplicate",
        edit: "Edit",
        remove: "Delete",
        readOnly: "Default template (read-only)",
        customBadge: "Custom template",
        wildcard: "Applies to all",
        formName: "Template name",
        formCountry: "Country",
        formLanguage: "Language",
        formPlatform: "Platform",
        formCategory: "Category",
        formImageType: "Image type",
        successCreated: "Template created.",
        successUpdated: "Template updated.",
        successDeleted: "Template deleted.",
        deleteConfirm: "Delete this custom template?",
      };
}

const emptyForm: FormState = {
  name: "",
  country: "*",
  language: "*",
  platform: "*",
  category: "*",
  imageType: "scene",
  promptTemplate: "",
  copyTemplate: "",
  layoutStyle: "adaptive",
  isDefault: false,
};

function labelFor(value: string, options: Array<{ value: string; label: Record<UiLanguage, string> }>, language: UiLanguage, wildcard: string) {
  if (value === "*") {
    return wildcard;
  }
  return options.find((option) => option.value === value)?.label[language] ?? value;
}

function buildQuery(filters: TemplateFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });
  return params.toString();
}

export function TemplateCenterClient({ initialTemplates, language }: { initialTemplates: TemplateRecord[]; language: UiLanguage }) {
  const text = useMemo(() => copyFor(language), [language]);
  const [templates, setTemplates] = useState(initialTemplates);
  const [filters, setFilters] = useState<TemplateFilters>({ source: "all" });
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(emptyForm);
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function fetchTemplates(nextFilters: TemplateFilters = filters) {
    const query = buildQuery(nextFilters);
    const response = await fetch(`/api/templates${query ? `?${query}` : ""}`, { cache: "no-store" });
    const data = (await response.json()) as TemplateRecord[] | { error?: string };
    if (!response.ok || !Array.isArray(data)) {
      throw new Error(Array.isArray(data) ? "Failed to load templates." : data.error || "Failed to load templates.");
    }
    setTemplates(data);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const query = buildQuery(filters);
        const response = await fetch(`/api/templates${query ? `?${query}` : ""}`, { cache: "no-store" });
        const data = (await response.json()) as TemplateRecord[] | { error?: string };
        if (!response.ok || !Array.isArray(data)) {
          throw new Error(Array.isArray(data) ? "Failed to load templates." : data.error || "Failed to load templates.");
        }
        if (!cancelled) {
          setTemplates(data);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Failed to load templates.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function resetEditor() {
    setEditingTemplateId(null);
    setFormState(emptyForm);
  }

  function handleDuplicate(template: TemplateRecord) {
    setEditingTemplateId(null);
    setFeedback("");
    setErrorMessage("");
    setFormState({
      name: `${template.name}-custom`,
      country: template.country,
      language: template.language,
      platform: template.platform,
      category: template.category,
      imageType: template.imageType,
      promptTemplate: template.promptTemplate,
      copyTemplate: template.copyTemplate,
      layoutStyle: template.layoutStyle,
      isDefault: false,
    });
  }

  function handleEdit(template: TemplateRecord) {
    if (template.isDefault) {
      handleDuplicate(template);
      return;
    }

    setEditingTemplateId(template.id);
    setFeedback("");
    setErrorMessage("");
    setFormState({
      name: template.name,
      country: template.country,
      language: template.language,
      platform: template.platform,
      category: template.category,
      imageType: template.imageType,
      promptTemplate: template.promptTemplate,
      copyTemplate: template.copyTemplate,
      layoutStyle: template.layoutStyle,
      isDefault: false,
    });
  }

  async function handleDelete(template: TemplateRecord) {
    if (template.isDefault || !window.confirm(text.deleteConfirm)) {
      return;
    }

    setFeedback("");
    setErrorMessage("");
    const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { error?: string } | { deleted?: boolean } | null;
    if (!response.ok) {
      setErrorMessage(body && "error" in body && body.error ? body.error : "Delete failed.");
      return;
    }

    setFeedback(text.successDeleted);
    await fetchTemplates();
    if (editingTemplateId === template.id) {
      resetEditor();
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setErrorMessage("");
    setIsSaving(true);

    const method = editingTemplateId ? "PUT" : "POST";
    const url = editingTemplateId ? `/api/templates/${editingTemplateId}` : "/api/templates";

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formState),
      });
      const body = (await response.json().catch(() => null)) as TemplateRecord | { error?: string } | null;
      if (!response.ok) {
        setErrorMessage(body && !Array.isArray(body) && "error" in body ? body.error || "Save failed." : "Save failed.");
        return;
      }

      setFeedback(editingTemplateId ? text.successUpdated : text.successCreated);
      resetEditor();
      await fetchTemplates();
    } finally {
      setIsSaving(false);
    }
  }

  const summary = useMemo(() => {
    const defaults = templates.filter((template) => template.isDefault).length;
    const custom = templates.length - defaults;
    const platformCount = new Set(templates.map((template) => template.platform)).size;
    const imageTypeCount = new Set(templates.map((template) => template.imageType)).size;
    return { defaults, custom, platformCount, imageTypeCount };
  }, [templates]);

  const scopeOptions = {
    countries: [{ value: "*", label: { zh: text.wildcard, en: text.wildcard } }, ...COUNTRIES],
    languages: [{ value: "*", label: { zh: text.wildcard, en: text.wildcard } }, ...OUTPUT_LANGUAGES],
    platforms: [{ value: "*", label: { zh: text.wildcard, en: text.wildcard } }, ...PLATFORMS],
    categories: [{ value: "*", label: { zh: text.wildcard, en: text.wildcard } }, ...PRODUCT_CATEGORIES],
  };

  return (
    <div className="stack gap-24 template-center-page">
      <section className="panel page-hero">
        <div className="page-hero-copy">
          <p className="eyebrow">Template System</p>
          <h2>{language === "zh" ? "模板中心" : "Template center"}</h2>
        </div>
        <div className="page-hero-meta">
          <div className="page-kpi-grid">
            <article className="page-kpi">
              <span>{text.total}</span>
              <strong>{templates.length}</strong>
            </article>
            <article className="page-kpi">
              <span>{text.defaults}</span>
              <strong>{summary.defaults}</strong>
            </article>
            <article className="page-kpi">
              <span>{text.custom}</span>
              <strong>{summary.custom}</strong>
            </article>
            <article className="page-kpi">
              <span>{text.platforms}</span>
              <strong>{summary.platformCount}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className="panel panel-stack">
        <div className="split-header compact">
          <div>
            <h3>{text.filters}</h3>
          </div>
          <div className="button-row">
            <button
              className="ghost-button"
              onClick={async () => {
                setErrorMessage("");
                setIsLoading(true);
                try {
                  await fetchTemplates();
                } catch (error) {
                  setErrorMessage(error instanceof Error ? error.message : "Failed to load templates.");
                } finally {
                  setIsLoading(false);
                }
              }}
              type="button"
            >
              {isLoading ? text.saving : text.refresh}
            </button>
            <button className="primary-button" onClick={resetEditor} type="button">
              {text.create}
            </button>
          </div>
        </div>
        <div className="filter-grid template-filter-grid">
          <label>
            <span>{text.search}</span>
            <input
              value={filters.search ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value || undefined }))}
            />
          </label>
          <label>
            <span>{text.source}</span>
            <select value={filters.source ?? "all"} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value as TemplateFilters["source"] }))}>
              <option value="all">{text.sourceAll}</option>
              <option value="default">{text.sourceDefault}</option>
              <option value="custom">{text.sourceCustom}</option>
            </select>
          </label>
          <label>
            <span>{text.formCountry}</span>
            <select value={filters.country ?? ""} onChange={(event) => setFilters((current) => ({ ...current, country: event.target.value || undefined }))}>
              <option value="">{text.sourceAll}</option>
              {COUNTRIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formLanguage}</span>
            <select value={filters.language ?? ""} onChange={(event) => setFilters((current) => ({ ...current, language: event.target.value || undefined }))}>
              <option value="">{text.sourceAll}</option>
              {OUTPUT_LANGUAGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formPlatform}</span>
            <select value={filters.platform ?? ""} onChange={(event) => setFilters((current) => ({ ...current, platform: event.target.value || undefined }))}>
              <option value="">{text.sourceAll}</option>
              {PLATFORMS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formCategory}</span>
            <select value={filters.category ?? ""} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value || undefined }))}>
              <option value="">{text.sourceAll}</option>
              {PRODUCT_CATEGORIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formImageType}</span>
            <select value={filters.imageType ?? ""} onChange={(event) => setFilters((current) => ({ ...current, imageType: event.target.value || undefined }))}>
              <option value="">{text.sourceAll}</option>
              {IMAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel panel-stack">
        <div className="split-header compact">
          <div>
            <h3>{text.editor}</h3>
            <p className="helper">{editingTemplateId ? `${text.edit} ID: ${editingTemplateId}` : text.createHint}</p>
          </div>
          {editingTemplateId ? (
            <button className="ghost-button" onClick={resetEditor} type="button">
              {text.cancelEdit}
            </button>
          ) : null}
        </div>
        <form className="template-editor-grid" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>{text.formName}</span>
            <input required value={formState.name} onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            <span>{text.formCountry}</span>
            <select value={formState.country} onChange={(event) => setFormState((current) => ({ ...current, country: event.target.value }))}>
              {scopeOptions.countries.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formLanguage}</span>
            <select value={formState.language} onChange={(event) => setFormState((current) => ({ ...current, language: event.target.value }))}>
              {scopeOptions.languages.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formPlatform}</span>
            <select value={formState.platform} onChange={(event) => setFormState((current) => ({ ...current, platform: event.target.value }))}>
              {scopeOptions.platforms.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formCategory}</span>
            <select value={formState.category} onChange={(event) => setFormState((current) => ({ ...current, category: event.target.value }))}>
              {scopeOptions.categories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.formImageType}</span>
            <select value={formState.imageType} onChange={(event) => setFormState((current) => ({ ...current, imageType: event.target.value }))}>
              {IMAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{text.layoutStyle}</span>
            <input required value={formState.layoutStyle} onChange={(event) => setFormState((current) => ({ ...current, layoutStyle: event.target.value }))} />
          </label>
          <label className="template-editor-full">
            <span>{text.promptTemplate}</span>
            <textarea required rows={5} value={formState.promptTemplate} onChange={(event) => setFormState((current) => ({ ...current, promptTemplate: event.target.value }))} />
          </label>
          <label className="template-editor-full">
            <span>{text.copyTemplate}</span>
            <textarea required rows={4} value={formState.copyTemplate} onChange={(event) => setFormState((current) => ({ ...current, copyTemplate: event.target.value }))} />
          </label>
          <div className="template-editor-actions">
            <button className="primary-button" disabled={isSaving} type="submit">
              {isSaving ? text.saving : text.save}
            </button>
            <button className="ghost-button" onClick={resetEditor} type="button">
              {text.reset}
            </button>
            {feedback ? <span className="success-text">{feedback}</span> : null}
            {errorMessage ? <span className="error-text">{errorMessage}</span> : null}
          </div>
        </form>
      </section>

      <section className="template-grid enhanced-template-grid">
        {templates.length ? (
          templates.map((template) => (
            <article className="panel template-card enhanced-template-card" key={template.id}>
              <div className="template-card-top">
                <div>
                  <span className="eyebrow">{labelFor(template.imageType, IMAGE_TYPE_OPTIONS, language, text.wildcard)}</span>
                  <h3>{template.name}</h3>
                </div>
                <span className={template.isDefault ? "template-badge is-default" : "template-badge is-custom"}>
                  {template.isDefault ? text.readOnly : text.customBadge}
                </span>
              </div>
              <div className="template-meta">
                <span>{labelFor(template.country, COUNTRIES, language, text.wildcard)}</span>
                <span>{labelFor(template.language, OUTPUT_LANGUAGES, language, text.wildcard)}</span>
                <span>{labelFor(template.platform, PLATFORMS, language, text.wildcard)}</span>
                <span>{labelFor(template.category, PRODUCT_CATEGORIES, language, text.wildcard)}</span>
              </div>
              <dl>
                <div>
                  <dt>{text.promptTemplate}</dt>
                  <dd>{template.promptTemplate}</dd>
                </div>
                <div>
                  <dt>{text.copyTemplate}</dt>
                  <dd>{template.copyTemplate}</dd>
                </div>
                <div>
                  <dt>{text.layoutStyle}</dt>
                  <dd>{template.layoutStyle}</dd>
                </div>
              </dl>
              <div className="template-card-actions">
                <button className="ghost-button" onClick={() => handleDuplicate(template)} type="button">
                  {text.duplicate}
                </button>
                {!template.isDefault ? (
                  <>
                    <button className="ghost-button" onClick={() => handleEdit(template)} type="button">
                      {text.edit}
                    </button>
                    <button className="ghost-button danger-button" onClick={() => void handleDelete(template)} type="button">
                      {text.remove}
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="panel">
            <p>{text.noData}</p>
          </div>
        )}
      </section>
    </div>
  );
}
