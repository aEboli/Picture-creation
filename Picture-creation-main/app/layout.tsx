import type { Metadata } from "next";

import { Navigation } from "@/components/navigation";
import { APP_NAME } from "@/lib/constants";
import { ensureRuntimeReady } from "@/lib/runtime";
import { getHistoryHeaderSummary, getHomePageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

import "./globals.css";
import "./ui-ux-pro-max.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "LAN-ready e-commerce image generation studio powered by Gemini.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  ensureRuntimeReady();
  const language = await getUiLanguage();
  const { integrations } = await getHomePageData();
  const summary = getHistoryHeaderSummary();

  return (
    <html lang={language}>
      <body>
        <div className="app-shell">
          <a className="skip-link" href="#main-content">
            {language === "zh" ? "跳转到主内容" : "Skip to main content"}
          </a>
          <Navigation integrations={integrations} language={language} summary={summary} />
          <main className="main-content" id="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
