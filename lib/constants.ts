import type { ImageType, SelectOption } from "@/lib/types";

export const APP_NAME = "Picture-creation";

export const COUNTRIES: SelectOption[] = [
  { value: "CN", label: { zh: "中国", en: "China" } },
  { value: "US", label: { zh: "美国", en: "United States" } },
  { value: "GB", label: { zh: "英国", en: "United Kingdom" } },
  { value: "DE", label: { zh: "德国", en: "Germany" } },
  { value: "FR", label: { zh: "法国", en: "France" } },
  { value: "JP", label: { zh: "日本", en: "Japan" } },
  { value: "KR", label: { zh: "韩国", en: "South Korea" } },
  { value: "CA", label: { zh: "加拿大", en: "Canada" } },
  { value: "AU", label: { zh: "澳大利亚", en: "Australia" } },
  { value: "SG", label: { zh: "新加坡", en: "Singapore" } },
];

export const OUTPUT_LANGUAGES: SelectOption[] = [
  { value: "zh-CN", label: { zh: "简体中文", en: "Simplified Chinese" } },
  { value: "en-US", label: { zh: "英语（美国）", en: "English (US)" } },
  { value: "en-GB", label: { zh: "英语（英国）", en: "English (UK)" } },
  { value: "de-DE", label: { zh: "德语", en: "German" } },
  { value: "fr-FR", label: { zh: "法语", en: "French" } },
  { value: "ja-JP", label: { zh: "日语", en: "Japanese" } },
  { value: "ko-KR", label: { zh: "韩语", en: "Korean" } },
  { value: "es-ES", label: { zh: "西班牙语", en: "Spanish" } },
  { value: "pt-BR", label: { zh: "葡萄牙语（巴西）", en: "Portuguese (Brazil)" } },
];

export const DEFAULT_LANGUAGE_BY_COUNTRY: Record<string, string> = {
  CN: "zh-CN",
  US: "en-US",
  GB: "en-GB",
  DE: "de-DE",
  FR: "fr-FR",
  JP: "ja-JP",
  KR: "ko-KR",
  CA: "en-US",
  AU: "en-GB",
  SG: "en-GB",
};

export function getDefaultLanguageForCountry(country: string): string | null {
  return DEFAULT_LANGUAGE_BY_COUNTRY[country] ?? null;
}

export const DEFAULT_COUNTRY_BY_LANGUAGE: Record<string, string> = {
  "zh-CN": "CN",
  "en-US": "US",
  "en-GB": "GB",
  "de-DE": "DE",
  "fr-FR": "FR",
  "ja-JP": "JP",
  "ko-KR": "KR",
  "es-ES": "US",
  "pt-BR": "US",
};

export function getDefaultCountryForLanguage(language: string): string | null {
  return DEFAULT_COUNTRY_BY_LANGUAGE[language] ?? null;
}

export const PLATFORMS: SelectOption[] = [
  { value: "amazon", label: { zh: "Amazon", en: "Amazon" } },
  { value: "tiktok-shop", label: { zh: "TikTok Shop", en: "TikTok Shop" } },
  { value: "taobao", label: { zh: "淘宝", en: "Taobao" } },
  { value: "tmall", label: { zh: "天猫", en: "Tmall" } },
  { value: "jd", label: { zh: "京东", en: "JD.com" } },
  { value: "pinduoduo", label: { zh: "拼多多", en: "Pinduoduo" } },
  { value: "temu", label: { zh: "Temu", en: "Temu" } },
  { value: "shein", label: { zh: "SHEIN", en: "SHEIN" } },
  { value: "shopee", label: { zh: "Shopee", en: "Shopee" } },
  { value: "lazada", label: { zh: "Lazada", en: "Lazada" } },
  { value: "ebay", label: { zh: "eBay", en: "eBay" } },
  { value: "etsy", label: { zh: "Etsy", en: "Etsy" } },
  { value: "rakuten", label: { zh: "Rakuten", en: "Rakuten" } },
  { value: "aliexpress", label: { zh: "AliExpress", en: "AliExpress" } },
];

export const PRODUCT_CATEGORIES: SelectOption[] = [
  { value: "fashion", label: { zh: "服饰", en: "Fashion" } },
  { value: "beauty", label: { zh: "美妆", en: "Beauty" } },
  { value: "home", label: { zh: "家居", en: "Home" } },
  { value: "electronics", label: { zh: "3C 数码", en: "Electronics" } },
  { value: "pets", label: { zh: "宠物", en: "Pets" } },
  { value: "baby", label: { zh: "母婴", en: "Baby" } },
  { value: "food", label: { zh: "食品", en: "Food" } },
  { value: "outdoor", label: { zh: "户外", en: "Outdoor" } },
  { value: "jewelry", label: { zh: "珠宝", en: "Jewelry" } },
  { value: "general", label: { zh: "泛品", en: "General" } },
];

export const IMAGE_TYPE_OPTIONS: Array<SelectOption & { value: ImageType }> = [
  {
    value: "main-image",
    label: { zh: "主图", en: "Main image" },
    description: { zh: "整套图中的主视觉图片主图", en: "Primary hero image for a product image set" },
  },
  {
    value: "lifestyle",
    label: { zh: "生活方式", en: "Lifestyle" },
    description: { zh: "展示产品融入生活场景的使用感", en: "Show the product inside an aspirational lifestyle context" },
  },
  {
    value: "scene",
    label: { zh: "场景图", en: "Lifestyle scene" },
    description: { zh: "把图片主体放进真实使用场景", en: "Place the product in a realistic lifestyle scene" },
  },
  {
    value: "white-background",
    label: { zh: "白底图", en: "White background" },
    description: { zh: "标准 listing 主图", en: "Clean white-background marketplace image" },
  },
  {
    value: "model",
    label: { zh: "模特图", en: "Model image" },
    description: { zh: "适合服饰或佩戴类产品", en: "Model-worn or model-used presentation" },
  },
  {
    value: "poster",
    label: { zh: "海报图", en: "Poster" },
    description: { zh: "强营销视觉和促销感", en: "Poster-style promotional creative" },
  },
  {
    value: "detail",
    label: { zh: "细节图", en: "Detail image" },
    description: { zh: "放大材质、做工和结构", en: "Highlight product materials and craftsmanship" },
  },
  {
    value: "pain-point",
    label: { zh: "痛点图", en: "Pain-point image" },
    description: { zh: "围绕问题与解决方案构图", en: "Sell through pain-point to solution storytelling" },
  },
  {
    value: "feature-overview",
    label: { zh: "卖点总览", en: "Feature overview" },
    description: { zh: "集中展示核心卖点与亮点结构", en: "Summarize the product's main benefits in one overview visual" },
  },
  {
    value: "material-craft",
    label: { zh: "材质工艺", en: "Material & craft" },
    description: { zh: "突出材质、纹理、工艺和做工细节", en: "Highlight material, texture, finish, and craftsmanship details" },
  },
  {
    value: "size-spec",
    label: { zh: "尺寸参数", en: "Size spec" },
    description: { zh: "展示尺寸、规格和关键参数", en: "Present dimensions, measurements, and spec highlights clearly" },
  },
  {
    value: "multi-scene",
    label: { zh: "多场景应用", en: "Multi-scene usage" },
    description: { zh: "展示产品在多个生活场景中的使用方式", en: "Show how the product works across multiple usage scenarios" },
  },
  {
    value: "culture-value",
    label: { zh: "文化价值", en: "Cultural value" },
    description: { zh: "传递品牌气质、情感价值和生活方式认同", en: "Express the product's emotional, cultural, or lifestyle value" },
  },
];

export const ASPECT_RATIOS: SelectOption[] = [
  { value: "1:1", label: { zh: "1:1", en: "1:1 Square" } },
  { value: "1:4", label: { zh: "1:4 长竖", en: "1:4 Ultra-tall" } },
  { value: "1:8", label: { zh: "1:8 超竖", en: "1:8 Banner portrait" } },
  { value: "3:2", label: { zh: "3:2 横", en: "3:2 Landscape" } },
  { value: "2:3", label: { zh: "2:3 竖", en: "2:3 Portrait" } },
  { value: "3:4", label: { zh: "3:4 竖", en: "3:4 Portrait" } },
  { value: "4:1", label: { zh: "4:1 超横", en: "4:1 Ultra-wide" } },
  { value: "4:3", label: { zh: "4:3 横", en: "4:3 Landscape" } },
  { value: "4:5", label: { zh: "4:5 竖", en: "4:5 Portrait" } },
  { value: "5:4", label: { zh: "5:4 横", en: "5:4 Landscape" } },
  { value: "8:1", label: { zh: "8:1 超横", en: "8:1 Banner" } },
  { value: "9:16", label: { zh: "9:16 竖屏", en: "9:16 Vertical" } },
  { value: "16:9", label: { zh: "16:9 横屏", en: "16:9 Landscape" } },
  { value: "21:9", label: { zh: "21:9 宽屏", en: "21:9 Cinematic" } },
  { value: "9:21", label: { zh: "9:21 竖屏", en: "9:21 Cinematic portrait" } },
];

export const RESOLUTIONS: SelectOption[] = [
  { value: "0.5K", label: { zh: "0.5K", en: "0.5K" } },
  { value: "1K", label: { zh: "1K", en: "1K" } },
  { value: "2K", label: { zh: "2K", en: "2K" } },
  { value: "4K", label: { zh: "4K", en: "4K" } },
];

export const UI_LANGUAGE_OPTIONS: SelectOption[] = [
  { value: "zh", label: { zh: "简体中文", en: "Simplified Chinese" } },
  { value: "en", label: { zh: "English", en: "English" } },
];

export const STATUS_COLORS: Record<string, string> = {
  queued: "var(--warning-soft)",
  processing: "var(--info-soft)",
  completed: "var(--success-soft)",
  partial: "var(--warning-soft)",
  failed: "var(--danger-soft)",
};
