import type { Metadata } from "next";

import { Navigation } from "@/components/navigation";
import { RuntimeSnapshotProvider } from "@/components/runtime-snapshot-provider";
import { APP_NAME } from "@/lib/constants";
import { getRuntimeHeaderSnapshot } from "@/lib/server/runtime/header-snapshot-service";
import { getUiLanguage } from "@/lib/ui-language";

import "./globals.css";
import "./ui-ux-pro-max.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "LAN-ready e-commerce image generation studio powered by Gemini.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const language = await getUiLanguage();
  const seedSnapshot = getRuntimeHeaderSnapshot();

  return (
    <html lang={language}>
      <body>
        <RuntimeSnapshotProvider seedSnapshot={seedSnapshot}>
          <div className="app-shell">
            <a className="skip-link" href="#main-content">
              {language === "zh" ? "跳转到主内容" : "Skip to main content"}
            </a>
            <Navigation language={language} />
            <main className="main-content" id="main-content">
              {children}
            </main>
          </div>
        </RuntimeSnapshotProvider>
      </body>
    </html>
  );
}
