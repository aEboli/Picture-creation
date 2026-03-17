"use client";

import { useMemo, useState, useTransition } from "react";

import type { BrandInput, BrandRecord, UiLanguage } from "@/lib/types";

const EMPTY_BRAND: BrandInput = {
  name: "",
  primaryColor: "#2563eb",
  tone: "",
  bannedTerms: "",
  promptGuidance: "",
};

export function BrandLibraryManager({
  initialBrands,
  language,
}: {
  initialBrands: BrandRecord[];
  language: UiLanguage;
}) {
  const [brands, setBrands] = useState(initialBrands);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(initialBrands[0]?.id ?? null);
  const [draft, setDraft] = useState<BrandInput>(() =>
    initialBrands[0]
      ? {
          name: initialBrands[0].name,
          primaryColor: initialBrands[0].primaryColor,
          tone: initialBrands[0].tone,
          bannedTerms: initialBrands[0].bannedTerms,
          promptGuidance: initialBrands[0].promptGuidance,
        }
      : EMPTY_BRAND,
  );
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const text = useMemo(
    () =>
      language === "zh"
        ? {
            eyebrow: "品牌库",
            title: "品牌库",
            description: "为常用品牌维护固定语气、品牌色、禁用词和提示词偏好，创作台填写品牌名后会自动带入这些规则。",
            listTitle: "品牌列表",
            empty: "还没有品牌配置，先创建第一个品牌档案。",
            create: "新建品牌",
            save: "保存品牌",
            saving: "保存中…",
            delete: "删除品牌",
            deletingConfirm:
              "确定删除这个品牌吗？删除后不会影响已有历史任务，但后续生成将不再命中该品牌规则。",
            saved: "品牌库已更新。",
            deleted: "品牌已删除。",
            saveFailed: "保存失败，请稍后重试。",
            deleteFailed: "删除失败，请稍后重试。",
            name: "品牌名",
            color: "品牌主色",
            tone: "品牌语气",
            bannedTerms: "禁用词",
            promptGuidance: "品牌提示词偏好",
            tonePlaceholder: "例如：专业、极简、可信、温和",
            bannedPlaceholder: "例如：最强、第一、绝对安全",
            promptPlaceholder: "例如：强调高级感、避免夸张光效、保留真实材质",
            active: "当前编辑",
            helper: "创作台可直接输入品牌名，命中后会自动叠加品牌规则。",
          }
        : {
            eyebrow: "Brand library",
            title: "Brand library",
            description:
              "Maintain reusable brand tone, color, banned terms, and prompt guidance. When the same brand name is used in Create, these rules are applied automatically.",
            listTitle: "Brands",
            empty: "No brand profile yet. Create your first one.",
            create: "New brand",
            save: "Save brand",
            saving: "Saving…",
            delete: "Delete brand",
            deletingConfirm:
              "Delete this brand profile? Existing history stays intact, but future jobs will no longer match this brand rule.",
            saved: "Brand library updated.",
            deleted: "Brand deleted.",
            saveFailed: "Save failed. Please try again.",
            deleteFailed: "Delete failed. Please try again.",
            name: "Brand name",
            color: "Primary color",
            tone: "Brand tone",
            bannedTerms: "Banned terms",
            promptGuidance: "Prompt guidance",
            tonePlaceholder: "e.g. premium, concise, trustworthy, warm",
            bannedPlaceholder: "e.g. best ever, number one, guaranteed safe",
            promptPlaceholder: "e.g. keep it premium, avoid exaggerated lighting, preserve natural materials",
            active: "Editing",
            helper: "Users can type a brand directly in Create, and matched rules will be applied automatically.",
          },
    [language],
  );

  const isEditingExisting = Boolean(selectedBrandId);

  function fillDraft(brand: BrandRecord | null) {
    setSelectedBrandId(brand?.id ?? null);
    setDraft(
      brand
        ? {
            name: brand.name,
            primaryColor: brand.primaryColor,
            tone: brand.tone,
            bannedTerms: brand.bannedTerms,
            promptGuidance: brand.promptGuidance,
          }
        : { ...EMPTY_BRAND },
    );
    setMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    startTransition(async () => {
      const endpoint = selectedBrandId ? `/api/brands/${selectedBrandId}` : "/api/brands";
      const method = selectedBrandId ? "PUT" : "POST";

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });

      const body = (await response.json().catch(() => null)) as
        | BrandRecord
        | {
            error?: string;
          }
        | null;

      if (!response.ok || !body || "error" in body) {
        setMessage(body && "error" in body && body.error ? body.error : text.saveFailed);
        return;
      }

      const brandRecord = body as BrandRecord;

      setBrands((current) => {
        if (selectedBrandId) {
          return current
            .map((brand) => (brand.id === brandRecord.id ? brandRecord : brand))
            .sort((left, right) => left.name.localeCompare(right.name));
        }

        return [...current, brandRecord].sort((left, right) => left.name.localeCompare(right.name));
      });
      fillDraft(brandRecord);
      setMessage(text.saved);
    });
  }

  function handleCreateNew() {
    fillDraft(null);
  }

  async function handleDelete() {
    if (!selectedBrandId || !window.confirm(text.deletingConfirm)) {
      return;
    }

    const response = await fetch(`/api/brands/${selectedBrandId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setMessage(text.deleteFailed);
      return;
    }

    const nextBrands = brands.filter((brand) => brand.id !== selectedBrandId);
    setBrands(nextBrands);
    fillDraft(nextBrands[0] ?? null);
    setMessage(text.deleted);
  }

  return (
    <section className="panel settings-brand-panel">
      <div className="split-header compact">
        <div>
          <p className="eyebrow">{text.eyebrow}</p>
          <h3>{text.title}</h3>
          <p className="helper">{text.description}</p>
        </div>
        <button className="ghost-button" onClick={handleCreateNew} type="button">
          {text.create}
        </button>
      </div>

      <div className="settings-brand-layout">
        <div className="brand-library-list">
          <div className="split-header compact">
            <strong>{text.listTitle}</strong>
            <small className="helper">{text.helper}</small>
          </div>

          {brands.length ? (
            <div className="brand-card-list">
              {brands.map((brand) => (
                <button
                  className={`brand-card-button ${selectedBrandId === brand.id ? "is-active" : ""}`}
                  key={brand.id}
                  onClick={() => fillDraft(brand)}
                  type="button"
                >
                  <span className="brand-card-dot" style={{ backgroundColor: brand.primaryColor }} />
                  <div className="brand-card-copy">
                    <strong>{brand.name}</strong>
                    <span>{brand.tone}</span>
                  </div>
                  {selectedBrandId === brand.id ? <span className="template-badge is-custom">{text.active}</span> : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="helper">{text.empty}</p>
          )}
        </div>

        <form className="brand-editor" onSubmit={handleSubmit}>
          <div className="grid two">
            <label>
              <span>{text.name}</span>
              <input
                required
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              <span>{text.color}</span>
              <input
                type="color"
                value={draft.primaryColor}
                onChange={(event) => setDraft((current) => ({ ...current, primaryColor: event.target.value }))}
              />
            </label>
          </div>

          <label>
            <span>{text.tone}</span>
            <input
              placeholder={text.tonePlaceholder}
              value={draft.tone}
              onChange={(event) => setDraft((current) => ({ ...current, tone: event.target.value }))}
            />
          </label>

          <label>
            <span>{text.bannedTerms}</span>
            <textarea
              rows={3}
              placeholder={text.bannedPlaceholder}
              value={draft.bannedTerms}
              onChange={(event) => setDraft((current) => ({ ...current, bannedTerms: event.target.value }))}
            />
          </label>

          <label>
            <span>{text.promptGuidance}</span>
            <textarea
              rows={5}
              placeholder={text.promptPlaceholder}
              value={draft.promptGuidance}
              onChange={(event) => setDraft((current) => ({ ...current, promptGuidance: event.target.value }))}
            />
          </label>

          {message ? <p className="helper success-text">{message}</p> : null}

          <div className="button-row">
            {isEditingExisting ? (
              <button className="ghost-button danger-button" onClick={handleDelete} type="button">
                {text.delete}
              </button>
            ) : null}
            <button className="primary-button" disabled={isPending} type="submit">
              {isPending ? text.saving : text.save}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
