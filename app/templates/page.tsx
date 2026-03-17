import { TemplateCenterClient } from "@/components/template-center-client";
import { getTemplatesPageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

export default async function TemplatesPage() {
  const language = await getUiLanguage();
  const { templates } = getTemplatesPageData();

  return <TemplateCenterClient initialTemplates={templates} language={language} />;
}
