import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_INLINE_IMAGE_MAX_BYTES,
  getMaxImagesPerPromptForModel,
  getMaxReferenceImagesPerRequest,
} from "./image-model-limits.ts";

test("gemini 2.5 flash image keeps a 3-image prompt limit", () => {
  assert.equal(getMaxImagesPerPromptForModel("gemini-2.5-flash-image"), 3);
  assert.equal(getMaxReferenceImagesPerRequest("gemini-2.5-flash-image"), 2);
});

test("gemini 3.1 flash image allows up to 14 input images", () => {
  assert.equal(getMaxImagesPerPromptForModel("gemini-3.1-flash-image-preview"), 14);
  assert.equal(getMaxReferenceImagesPerRequest("gemini-3.1-flash-image-preview"), 13);
});

test("inline upload limit follows the documented 7 MB cap", () => {
  assert.equal(DEFAULT_INLINE_IMAGE_MAX_BYTES, 7 * 1024 * 1024);
});
