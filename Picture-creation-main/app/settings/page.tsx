import { BrandLibraryManager } from "@/components/brand-library-manager";
import { SettingsForm } from "@/components/settings-form";
import { t } from "@/lib/i18n";
import { getSettingsPageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

export default async function SettingsPage() {
  const language = await getUiLanguage();
  const { settings, brands } = getSettingsPageData();

  const highlights =
    language === "zh"
      ? [
          { label: "Provider", value: "Gemini", description: "官方接口与 relay 统一接入" },
          { label: "Sync", value: "Feishu", description: "字段映射、连通测试与回写" },
          { label: "Ops", value: "Queue", description: "素材目录、并发配额与节奏控制" },
        ]
      : [
          { label: "Provider", value: "Gemini", description: "Official and relay access in one place" },
          { label: "Sync", value: "Feishu", description: "Mapping, connectivity tests, and write-back" },
          { label: "Ops", value: "Queue", description: "Assets, concurrency, and pacing controls" },
        ];

  return (
    <div className="stack gap-24 settings-page">
      <section className="panel page-hero settings-page-intro">
        <div className="page-hero-copy">
          <p className="eyebrow">{t(language, "navSettings")}</p>
          <h2>{t(language, "settingsTitle")}</h2>
          <p>
            {language === "zh"
              ? "把模型接入、同步链路和运行节奏收拢到一个控制台里，让团队环境更可控、可测、可交付。"
              : "Bring providers, sync workflows, and runtime controls into one console so the team setup stays testable and deliverable."}
          </p>
        </div>
        <div className="page-hero-meta">
          <div className="page-kpi-grid">
            {highlights.map((item) => (
              <article className="page-kpi" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <SettingsForm initialSettings={settings} language={language} />
      <BrandLibraryManager initialBrands={brands} language={language} />
    </div>
  );
}
