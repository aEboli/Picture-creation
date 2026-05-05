import type { CSSProperties } from "react";

import Link from "next/link";

import { AnimatedCounter } from "@/components/animated-counter";
import { PageTransition, StaggerContainer, StaggerItem } from "@/components/page-transition";
import { ThemeToggle } from "@/components/theme-toggle";
import { getHomePageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

type IntegrationState = "ready" | "partial" | "inactive";

function getStatusCopy(language: "zh" | "en", state: IntegrationState) {
  if (language === "zh") {
    if (state === "ready") return "正常";
    if (state === "partial") return "异常";
    return "离线";
  }
  if (state === "ready") return "Ready";
  if (state === "partial") return "Issue";
  return "Offline";
}

function getStatusColor(state: IntegrationState) {
  if (state === "ready") return "#44a9ff";
  if (state === "partial") return "#ff6f6f";
  return "#8f8898";
}

export default async function HomePage() {
  const uiLanguage = await getUiLanguage();
  const language = uiLanguage === "zh" ? "zh" : "en";
  const { integrations, stats } = await getHomePageData();

  const metrics =
    language === "zh"
      ? [
          { label: "累计任务", value: stats.jobs, accent: "#f0b63a", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
          { label: "累计素材", value: stats.assets, accent: "#44a9ff", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
          { label: "支持市场", value: stats.markets, accent: "#69b9ff", icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
        ]
      : [
          { label: "Jobs", value: stats.jobs, accent: "#f0b63a", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
          { label: "Assets", value: stats.assets, accent: "#44a9ff", icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" },
          { label: "Markets", value: stats.markets, accent: "#69b9ff", icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
        ];

  const actions =
    language === "zh"
      ? [
          { href: "/create", title: "新建任务", eyebrow: "Studio", desc: "创建电商图片生成任务", tone: "primary" },
          { href: "/history", title: "查看历史", eyebrow: "Archive", desc: "浏览所有历史任务", tone: "secondary" },
          { href: "/settings", title: "系统设置", eyebrow: "Console", desc: "配置系统参数", tone: "core" },
        ]
      : [
          { href: "/create", title: "New Job", eyebrow: "Studio", desc: "Create image generation job", tone: "primary" },
          { href: "/history", title: "History", eyebrow: "Archive", desc: "Browse all past jobs", tone: "secondary" },
          { href: "/settings", title: "Settings", eyebrow: "Console", desc: "Configure system", tone: "core" },
        ];

  const statusChips = [
    { label: "API", state: integrations.gemini },
    { label: language === "zh" ? "飞书" : "Feishu", state: integrations.feishu },
    { label: "LAN", state: integrations.lan },
  ];

  return (
    <PageTransition>
      <div className="dashboard">
        <section className="dashboard-hero">
          <div className="dashboard-hero-text">
            <p className="dashboard-eyebrow">{language === "zh" ? "Overview" : "Overview"}</p>
            <h1 className="dashboard-title">
              {language === "zh" ? "电商图生成工作台" : "Commerce Image Studio"}
            </h1>
            <p className="dashboard-subtitle">
              {language === "zh" ? "生成 · 审核 · 交付" : "Generate · Review · Deliver"}
            </p>
          </div>
          <div className="dashboard-status-row">
            {statusChips.map((chip) => (
              <div
                className="dashboard-status-chip"
                key={chip.label}
                style={{ "--chip-color": getStatusColor(chip.state) } as CSSProperties}
              >
                <span className="dashboard-status-dot" />
                <span>{chip.label}</span>
                <strong>{getStatusCopy(language, chip.state)}</strong>
              </div>
            ))}
            <div className="dashboard-theme-control">
              <ThemeToggle language={language} />
            </div>
          </div>
        </section>

        <StaggerContainer className="dashboard-metrics">
          {metrics.map((m) => (
            <StaggerItem key={m.label}>
              <article
                className="dashboard-metric-card"
                style={{ "--metric-accent": m.accent } as CSSProperties}
              >
                <div className="dashboard-metric-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={m.icon} />
                  </svg>
                </div>
                <div className="dashboard-metric-body">
                  <span className="dashboard-metric-label">{m.label}</span>
                  <strong className="dashboard-metric-value">
                    <AnimatedCounter value={m.value} />
                  </strong>
                </div>
                <div className="dashboard-metric-bar">
                  <div className="dashboard-metric-bar-fill" />
                </div>
              </article>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <StaggerContainer className="dashboard-actions">
          {actions.map((a) => (
            <StaggerItem key={a.href}>
              <Link className={`dashboard-action-card is-${a.tone}`} href={a.href}>
                <span className="dashboard-action-eyebrow">{a.eyebrow}</span>
                <strong className="dashboard-action-title">{a.title}</strong>
                <p className="dashboard-action-desc">{a.desc}</p>
                <svg className="dashboard-action-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </PageTransition>
  );
}
