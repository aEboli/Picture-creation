export const DEFAULT_INLINE_IMAGE_MAX_BYTES = 7 * 1024 * 1024;

const GEMINI_2_5_FLASH_IMAGE_MAX_IMAGES_PER_PROMPT = 3;
const GEMINI_3_FLASH_IMAGE_MAX_IMAGES_PER_PROMPT = 14;

export function isGemini3ImageModel(imageModel: string) {
  return imageModel.toLowerCase().includes("gemini-3");
}

export function getMaxImagesPerPromptForModel(imageModel: string) {
  return isGemini3ImageModel(imageModel) ? GEMINI_3_FLASH_IMAGE_MAX_IMAGES_PER_PROMPT : GEMINI_2_5_FLASH_IMAGE_MAX_IMAGES_PER_PROMPT;
}

export function getMaxReferenceImagesPerRequest(imageModel: string) {
  return Math.max(0, getMaxImagesPerPromptForModel(imageModel) - 1);
}
