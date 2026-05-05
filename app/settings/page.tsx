import { SettingsForm } from "@/components/settings-form";
import { getSettingsPageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

export default async function SettingsPage() {
  const language = await getUiLanguage();
  const { settings } = getSettingsPageData();

  return (
    <div className="stack gap-24 settings-page">
      <SettingsForm initialSettings={settings} language={language} />
    </div>
  );
}
