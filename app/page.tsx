import type { CSSProperties } from "react";

import Link from "next/link";

import { HomePageStatusChips } from "@/components/home-page-status-chips";
import { getHomePageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

type OverviewMetric = {
  label: string;
  value: string;
  accent: string;
};

type OverviewAction = {
  href: string;
  title: string;
  eyebrow: string;
  tone: "primary" | "secondary" | "core";
};

export default async function HomePage() {
  const uiLanguage = await getUiLanguage();
  const language = uiLanguage === "zh" ? "zh" : "en";
  const { stats } = await getHomePageData();

  const metrics: OverviewMetric[] =
    language === "zh"
      ? [
          { label: "累计任务", value: stats.jobs.toString(), accent: "#f0b63a" },
          { label: "累计素材", value: stats.assets.toString(), accent: "#44a9ff" },
          { label: "支持市场", value: stats.markets.toString(), accent: "#69b9ff" },
        ]
      : [
          { label: "Jobs", value: stats.jobs.toString(), accent: "#f0b63a" },
          { label: "Assets", value: stats.assets.toString(), accent: "#44a9ff" },
          { label: "Markets", value: stats.markets.toString(), accent: "#69b9ff" },
        ];

  const actions: OverviewAction[] =
    language === "zh"
      ? [
          { href: "/create", title: "新建任务", eyebrow: "Studio", tone: "primary" },
          { href: "/history", title: "查看历史", eyebrow: "Archive", tone: "secondary" },
          { href: "/settings", title: "系统设置", eyebrow: "Console", tone: "core" },
        ]
      : [
          { href: "/create", title: "New job", eyebrow: "Studio", tone: "primary" },
          { href: "/history", title: "History", eyebrow: "Archive", tone: "secondary" },
          { href: "/settings", title: "Settings", eyebrow: "Console", tone: "core" },
        ];

  return (
    <div className="overview-page overview-page-liquid">
      <section
        aria-label={language === "zh" ? "总览入口" : "Overview hub"}
        className="panel overview-symmetric-shell"
      >
        <h1 className="overview-visually-hidden">
          {language === "zh" ? "电商图生成工作台" : "Commerce image studio"}
        </h1>

        <div className="overview-symmetric-hero">
          <div className="overview-symmetric-axis overview-symmetric-axis-left" aria-hidden="true" />
          <div className="overview-symmetric-title">
            <p className="eyebrow">{language === "zh" ? "Overview" : "Overview"}</p>
            <h2>{language === "zh" ? "电商图生成工作台" : "Commerce Image Studio"}</h2>
            <div className="overview-symmetric-live">
              {language === "zh" ? "生成 · 审核 · 交付" : "Generate · Review · Deliver"}
            </div>
          </div>
          <div className="overview-symmetric-axis overview-symmetric-axis-right" aria-hidden="true" />
        </div>

        <div className="overview-symmetric-status-rail">
          <HomePageStatusChips language={language} />
        </div>

        <div className="overview-symmetric-grid">
          {metrics.map((metric) => (
            <article
              className="overview-symmetric-card overview-symmetric-card-metric"
              key={metric.label}
              style={{ "--metric-accent": metric.accent } as CSSProperties}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}

          {actions.map((action) => (
            <Link
              className={`overview-symmetric-card overview-symmetric-card-action is-${action.tone}`}
              href={action.href}
              key={action.href}
            >
              <span>{action.eyebrow}</span>
              <strong>{action.title}</strong>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
