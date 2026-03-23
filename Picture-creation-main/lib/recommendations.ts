import type { UiLanguage } from "@/lib/types";

export interface RecommendedCreateDefaults {
  selectedTypes: string[];
  selectedRatios: string[];
  selectedResolutions: string[];
  variantsPerType: number;
  reason: Record<UiLanguage, string>;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function getRecommendedCreateDefaults(input: { platform: string; category: string }): RecommendedCreateDefaults {
  const base: RecommendedCreateDefaults = {
    selectedTypes: ["scene", "detail"],
    selectedRatios: ["1:1", "4:5"],
    selectedResolutions: ["1K", "2K"],
    variantsPerType: 2,
    reason: {
      zh: "已按当前平台和品类推荐更常用的出图组合。",
      en: "Applied a recommended setup for the current platform and category.",
    },
  };

  switch (input.platform) {
    case "amazon":
      base.selectedTypes = ["white-background", "scene", "detail"];
      base.selectedRatios = ["1:1", "4:5"];
      base.selectedResolutions = ["1K", "2K"];
      break;
    case "tiktok-shop":
      base.selectedTypes = ["scene", "poster", "pain-point"];
      base.selectedRatios = ["4:5", "9:16"];
      base.selectedResolutions = ["1K", "2K"];
      break;
    case "taobao":
    case "tmall":
    case "jd":
      base.selectedTypes = ["scene", "detail", "pain-point", "poster"];
      base.selectedRatios = ["3:4", "4:5"];
      base.selectedResolutions = ["1K", "2K"];
      break;
    case "shopee":
    case "lazada":
    case "aliexpress":
      base.selectedTypes = ["white-background", "scene", "detail"];
      base.selectedRatios = ["1:1", "4:5"];
      break;
    default:
      break;
  }

  if (input.category === "fashion") {
    base.selectedTypes = unique([...base.selectedTypes, "model"]);
    base.selectedRatios = unique([...base.selectedRatios, "3:4"]);
  }

  if (input.category === "beauty") {
    base.selectedTypes = unique([...base.selectedTypes, "poster"]);
  }

  if (input.category === "electronics") {
    base.selectedTypes = unique(base.selectedTypes.filter((item) => item !== "model").concat("pain-point"));
  }

  return base;
}
