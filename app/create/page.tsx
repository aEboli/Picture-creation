import { CreateJobForm } from "@/components/create-job-form";
import { getSettingsForQuery } from "@/lib/server/settings/service";
import { getUiLanguage } from "@/lib/ui-language";

export default async function CreatePage() {
  const language = await getUiLanguage();
  const settings = getSettingsForQuery();

  return (
    <div className="create-page-shell stack gap-24">
      <CreateJobForm defaultImageModel={settings.defaultImageModel} language={language} />
    </div>
  );
}
