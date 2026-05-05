import type { Metadata } from "next";

import { AnimatedBackground } from "@/components/animated-background";
import { ServiceSettingsDrawer } from "@/components/service-settings-drawer";
import { SidebarNav } from "@/components/sidebar-nav";
import { APP_NAME } from "@/lib/constants";
import { ensureRuntimeReady } from "@/lib/runtime";
import { getHistoryHeaderSummary, getHomePageData, getServiceDrawerSettingsForQuery } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

import "./globals.css";
import "./ui-ux-pro-max.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "LAN-ready e-commerce image generation studio powered by configurable APIs.",
};

const themeBootstrapScript = `
try {
  var storedTheme = window.localStorage.getItem("picture-creation-theme");
  var theme = storedTheme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "light" ? "light" : "dark";
} catch (_) {}
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  ensureRuntimeReady();
  const language = await getUiLanguage();
  const { integrations } = await getHomePageData();
  const serviceDrawerSettings = getServiceDrawerSettingsForQuery();
  const summary = getHistoryHeaderSummary();

  return (
    <html lang={language} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <AnimatedBackground />
        <div className="app-shell">
          <a className="skip-link" href="#main-content">
            {language === "zh" ? "跳转到主内容" : "Skip to main content"}
          </a>
          <SidebarNav integrations={integrations} language={language} summary={summary} />
          <main className="main-content" id="main-content">
            {children}
          </main>
          <ServiceSettingsDrawer initialSettings={serviceDrawerSettings} language={language} />
        </div>
      </body>
    </html>
  );
}
