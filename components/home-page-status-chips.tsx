"use client";

import type { CSSProperties } from "react";

import { useRuntimeSnapshot, type IntegrationState } from "@/components/runtime-snapshot-provider";

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

export function HomePageStatusChips({ language }: { language: "zh" | "en" }) {
  const { snapshot } = useRuntimeSnapshot();
  const { integrations } = snapshot;

  const statusChips = [
    { label: "Gemini", state: integrations.gemini },
    { label: language === "zh" ? "飞书" : "Feishu", state: integrations.feishu },
    { label: "LAN", state: integrations.lan },
  ];

  return (
    <>
      {statusChips.map((chip) => (
        <article
          className="overview-symmetric-status-chip"
          key={chip.label}
          style={{ "--integration-accent": getStatusColor(chip.state) } as CSSProperties}
        >
          <span>{chip.label}</span>
          <strong>{getStatusCopy(language, chip.state)}</strong>
        </article>
      ))}
    </>
  );
}
