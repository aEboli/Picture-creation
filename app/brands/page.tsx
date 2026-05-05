import { BrandLibraryManager } from "@/components/brand-library-manager";
import { getSettingsPageData } from "@/lib/server/workspace/queries";
import { getUiLanguage } from "@/lib/ui-language";

export default async function BrandsPage() {
  const language = await getUiLanguage();
  const { brands } = getSettingsPageData();

  return (
    <div className="stack gap-24 settings-page">
      <BrandLibraryManager initialBrands={brands} language={language} />
    </div>
  );
}
