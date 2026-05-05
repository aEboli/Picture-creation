"use client";

import type { CSSProperties } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";

import type { UiLanguage } from "@/lib/types";

import { CreateAgentPanel } from "@/components/create-agent-panel";
import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { SERVICE_SETTINGS_QUICK_OPEN_EVENT, type ServiceSettingsQuickTarget } from "@/lib/service-settings-events";

type IntegrationState = "ready" | "partial" | "inactive";

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

function NavIcon({ type }: { type: string }) {
  const paths: Record<string, string> = {
    overview: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
    studio: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    history: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    settings:
      "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    brands: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01",
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[type] || paths.overview} />
    </svg>
  );
}

export function SidebarNav({
  language,
  summary,
  integrations,
}: {
  language: UiLanguage;
  summary: {
    totalJobs: number;
    totalGenerated: number;
    totalSucceeded: number;
    totalFailed: number;
  };
  integrations: {
    gemini: IntegrationState;
    feishu: IntegrationState;
    lan: IntegrationState;
  };
}) {
  const pathname = usePathname();
  const normalizedPathname = pathname?.startsWith("/jobs/") ? "/history" : pathname;
  const isCreatePage = normalizedPathname === "/create";
  const [collapsed, setCollapsed] = useState(false);
  const [quickActionsReady, setQuickActionsReady] = useState(false);

  const links = [
    { href: "/", label: language === "zh" ? "总览" : "Overview", icon: "overview" },
    { href: "/create", label: language === "zh" ? "创作台" : "Studio", icon: "studio" },
    { href: "/history", label: language === "zh" ? "历史记录" : "History", icon: "history" },
    { href: "/brands", label: language === "zh" ? "品牌库" : "Brands", icon: "brands" },
  ];

  const integrationChips = [
    { label: "API", state: integrations.gemini, quickTarget: "api" as const },
    { label: language === "zh" ? "飞书" : "Feishu", state: integrations.feishu, quickTarget: "feishu" as const },
    { label: "LAN", state: integrations.lan },
  ];

  function openQuickSettings(target: ServiceSettingsQuickTarget) {
    window.dispatchEvent(new CustomEvent(SERVICE_SETTINGS_QUICK_OPEN_EVENT, { detail: { target } }));
  }

  useEffect(() => {
    setQuickActionsReady(true);
  }, []);

  return (
    <>
      <aside className={`sidebar ${collapsed ? "sidebar--collapsed" : ""}`}>
        <div className="sidebar-header">
          {!collapsed && (
            <div className="sidebar-brand">
              <div className="sidebar-logo">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="4" stroke="url(#logo-grad)" strokeWidth="1.5" />
                  <circle cx="8.5" cy="8.5" r="2" fill="url(#logo-grad)" />
                  <path d="M3 16l5-5 4 4 3-3 6 6" stroke="url(#logo-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  <defs>
                    <linearGradient id="logo-grad" x1="3" y1="3" x2="21" y2="21">
                      <stop stopColor="#60a5fa" />
                      <stop offset="1" stopColor="#a78bfa" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span className="sidebar-brand-text">Picture Studio</span>
            </div>
          )}
          <button className="sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d={collapsed ? "M9 18l6-6-6-6" : "M15 18l-6-6 6-6"} />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label={language === "zh" ? "主导航" : "Primary navigation"}>
          {links.map((link) => {
            const isActive = normalizedPathname === link.href;
            return (
              <Link key={link.href} className={`sidebar-link ${isActive ? "is-active" : ""}`} href={link.href}>
                <span className="sidebar-link-icon">
                  <NavIcon type={link.icon} />
                </span>
                {!collapsed && <span className="sidebar-link-label">{link.label}</span>}
                {isActive && <div className="sidebar-active-indicator" />}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {!collapsed && (
            <div className="sidebar-status">
              {integrationChips.map((chip) =>
                chip.quickTarget && quickActionsReady ? (
                  <button
                    aria-label={language === "zh" ? `快速配置${chip.label}` : `Quick configure ${chip.label}`}
                    className="sidebar-status-chip sidebar-status-chip-button"
                    key={chip.label}
                    onClick={() => openQuickSettings(chip.quickTarget)}
                    style={{ "--status-color": getStatusColor(chip.state) } as CSSProperties}
                    type="button"
                  >
                    <span className="sidebar-status-dot" />
                    <span>{chip.label}</span>
                  </button>
                ) : (
                  <div
                    className="sidebar-status-chip"
                    key={chip.label}
                    style={{ "--status-color": getStatusColor(chip.state) } as CSSProperties}
                  >
                    <span className="sidebar-status-dot" />
                    <span>{chip.label}</span>
                  </div>
                ),
              )}
            </div>
          )}
          <ThemeToggle language={language} compact={collapsed} />
          <div className="sidebar-lang">
            <LanguageToggle language={language} />
          </div>
        </div>
      </aside>

      {isCreatePage && (
        <div className="sidebar-agent-panel">
          <CreateAgentPanel />
        </div>
      )}
    </>
  );
}
