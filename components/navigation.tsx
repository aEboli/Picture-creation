"use client";

import type { CSSProperties } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { UiLanguage } from "@/lib/types";

import { CreateAgentPanel } from "@/components/create-agent-panel";
import { LanguageToggle } from "@/components/language-toggle";
import { useRuntimeSnapshot, type IntegrationState } from "@/components/runtime-snapshot-provider";

function getStatusCopy(language: UiLanguage, state: IntegrationState) {
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

export function Navigation({ language }: { language: UiLanguage }) {
  const { snapshot } = useRuntimeSnapshot();
  const { summary, integrations } = snapshot;
  const pathname = usePathname();
  const normalizedPathname = pathname?.startsWith("/jobs/") ? "/history" : pathname;
  const isCreatePage = normalizedPathname === "/create";
  const links = [
    { href: "/", label: language === "zh" ? "总览" : "Overview" },
    { href: "/create", label: language === "zh" ? "创作台" : "Studio" },
    { href: "/history", label: language === "zh" ? "历史记录" : "History" },
    { href: "/settings", label: language === "zh" ? "设置" : "Settings" },
    { href: "/brands", label: language === "zh" ? "品牌库" : "Brand Library" },
  ];

  const summaryChips =
    language === "zh"
      ? [
          { label: "累计任务", value: summary.totalJobs.toString(), tone: "accent" },
          { label: "累计生成", value: summary.totalGenerated.toString(), tone: "info" },
          { label: "成功任务", value: summary.totalSucceeded.toString(), tone: "accent" },
          { label: "失败任务", value: summary.totalFailed.toString(), tone: "danger" },
        ]
      : [
          { label: "Jobs", value: summary.totalJobs.toString(), tone: "accent" },
          { label: "Generated", value: summary.totalGenerated.toString(), tone: "info" },
          { label: "Succeeded", value: summary.totalSucceeded.toString(), tone: "accent" },
          { label: "Failed", value: summary.totalFailed.toString(), tone: "danger" },
        ];

  const integrationChips = [
    { label: "Gemini", state: integrations.gemini },
    { label: language === "zh" ? "飞书" : "Feishu", state: integrations.feishu },
    { label: "LAN", state: integrations.lan },
  ];

  return (
    <header className="app-header">
      <section
        aria-label={language === "zh" ? "图片统计" : "Image stats"}
        className="app-header-insight-rail"
      >
        <div className="app-header-history-strip">
          {summaryChips.map((chip) => (
            <article className={`app-header-summary-chip is-${chip.tone}`} key={chip.label}>
              <span>{chip.label}</span>
              <strong>{chip.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <div className="app-header-center-cluster">
        {isCreatePage ? (
          <div className="app-header-agent-slot">
            <CreateAgentPanel />
          </div>
        ) : null}

        <div className="app-header-nav-shell">
          <nav
            aria-label={language === "zh" ? "主导航" : "Primary navigation"}
            className="app-nav"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                className={normalizedPathname === link.href ? "is-active" : undefined}
                href={link.href}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="app-header-control-cluster">
        <section
          aria-label={language === "zh" ? "系统状态" : "System status"}
          className="app-header-status-panel"
        >
          <div className="app-header-status-strip">
            {integrationChips.map((chip) => (
              <div
                className="app-header-status-chip"
                key={chip.label}
                style={{ "--integration-accent": getStatusColor(chip.state) } as CSSProperties}
              >
                <span>{chip.label}</span>
                <strong>{getStatusCopy(language, chip.state)}</strong>
              </div>
            ))}
          </div>
        </section>

        <div className="app-header-actions">
          <LanguageToggle language={language} />
        </div>
      </div>
    </header>
  );
}
