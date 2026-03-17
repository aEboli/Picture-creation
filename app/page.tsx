import type { CSSProperties } from "react";

import Link from "next/link";

import { getHomePageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

type OverviewMetric = {
  label: string;
  value: string;
  accent: string;
  slot: string;
};

type OverviewAction = {
  href: string;
  title: string;
  subtitle: string;
  tone: "primary" | "secondary" | "support" | "core";
  slot: string;
};

export default async function HomePage() {
  const language = await getUiLanguage();
  const { stats } = await getHomePageData();

  const metrics: OverviewMetric[] =
    language === "zh"
      ? [
          { label: "累计任务", value: stats.jobs.toString(), accent: "#f0b63a", slot: "overview-slot-jobs" },
          { label: "累计素材", value: stats.assets.toString(), accent: "#44a9ff", slot: "overview-slot-assets" },
          {
            label: "可用模板",
            value: stats.templates.toString(),
            accent: "#f0b63a",
            slot: "overview-slot-templates-metric",
          },
          { label: "支持市场", value: stats.markets.toString(), accent: "#69b9ff", slot: "overview-slot-markets" },
        ]
      : [
          { label: "Jobs", value: stats.jobs.toString(), accent: "#f0b63a", slot: "overview-slot-jobs" },
          { label: "Assets", value: stats.assets.toString(), accent: "#44a9ff", slot: "overview-slot-assets" },
          {
            label: "Templates",
            value: stats.templates.toString(),
            accent: "#f0b63a",
            slot: "overview-slot-templates-metric",
          },
          { label: "Markets", value: stats.markets.toString(), accent: "#69b9ff", slot: "overview-slot-markets" },
        ];

  const actions: OverviewAction[] =
    language === "zh"
      ? [
          {
            href: "/create",
            title: "新建任务",
            subtitle: "进入批量生图工作台",
            tone: "primary",
            slot: "overview-slot-create",
          },
          {
            href: "/history",
            title: "查看历史",
            subtitle: "复用结果并继续迭代",
            tone: "secondary",
            slot: "overview-slot-history",
          },
          {
            href: "/templates",
            title: "模板中心",
            subtitle: "管理平台与市场模板",
            tone: "support",
            slot: "overview-slot-templates-action",
          },
          {
            href: "/settings",
            title: "系统设置",
            subtitle: "配置模型与飞书同步",
            tone: "core",
            slot: "overview-slot-settings",
          },
        ]
      : [
          {
            href: "/create",
            title: "New job",
            subtitle: "Open the batch studio",
            tone: "primary",
            slot: "overview-slot-create",
          },
          {
            href: "/history",
            title: "History",
            subtitle: "Reuse results and iterate",
            tone: "secondary",
            slot: "overview-slot-history",
          },
          {
            href: "/templates",
            title: "Templates",
            subtitle: "Manage market templates",
            tone: "support",
            slot: "overview-slot-templates-action",
          },
          {
            href: "/settings",
            title: "Settings",
            subtitle: "Configure models and sync",
            tone: "core",
            slot: "overview-slot-settings",
          },
        ];

  return (
    <div className="overview-page overview-page-liquid">
      <section
        aria-label={language === "zh" ? "总览入口" : "Overview hub"}
        className="panel overview-liquid-capsule overview-liquid-capsule-compact overview-liquid-capsule-bento"
      >
        <h1 className="overview-visually-hidden">
          {language === "zh" ? "当前站点能力" : "Current capabilities"}
        </h1>
        <div className="overview-liquid-body overview-liquid-body-compact overview-liquid-bento">
          {metrics.map((metric) => (
            <article
              key={metric.label}
              className={`overview-liquid-metric overview-liquid-card ${metric.slot}`}
              style={{ "--metric-accent": metric.accent } as CSSProperties}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}

          {actions.map((action) => (
            <Link
              key={action.href}
              className={`overview-liquid-action overview-liquid-card is-${action.tone} ${action.slot}`}
              href={action.href}
            >
              <strong>{action.title}</strong>
              <span>{action.subtitle}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
