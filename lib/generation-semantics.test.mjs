import test from "node:test";
import assert from "node:assert/strict";

import {
  getMaxReferenceImagesForSelection,
  getMaxSourceImagesForSelection,
  getPlannedRequestCount,
  getRequestInputGroupCount,
} from "./generation-semantics.ts";

test("joint semantics collapses multiple source images into a single request group", () => {
  assert.equal(
    getRequestInputGroupCount({
      creationMode: "standard",
      generationSemantics: "joint",
      sourceImageCount: 4,
    }),
    1,
  );
});

test("batch semantics keeps one request group per source image", () => {
  assert.equal(
    getRequestInputGroupCount({
      creationMode: "standard",
      generationSemantics: "batch",
      sourceImageCount: 4,
    }),
    4,
  );
});

test("prompt mode still plans one request when no image is uploaded", () => {
  assert.equal(
    getRequestInputGroupCount({
      creationMode: "prompt",
      generationSemantics: "joint",
      sourceImageCount: 0,
    }),
    1,
  );
});

test("planned request count follows the semantics-aware input group count", () => {
  assert.equal(
    getPlannedRequestCount({
      creationMode: "standard",
      generationSemantics: "joint",
      sourceImageCount: 4,
      typeCount: 2,
      ratioCount: 1,
      resolutionCount: 1,
      variantsPerType: 3,
    }),
    6,
  );

  assert.equal(
    getPlannedRequestCount({
      creationMode: "standard",
      generationSemantics: "batch",
      sourceImageCount: 4,
      typeCount: 2,
      ratioCount: 1,
      resolutionCount: 1,
      variantsPerType: 3,
    }),
    24,
  );
});

test("joint reference remix shares the 14-image request cap across source and reference groups", () => {
  assert.equal(
    getMaxSourceImagesForSelection("gemini-3.1-flash-image-preview", {
      generationSemantics: "joint",
      referenceImageCount: 5,
    }),
    9,
  );

  assert.equal(
    getMaxReferenceImagesForSelection("gemini-3.1-flash-image-preview", {
      generationSemantics: "joint",
      sourceImageCount: 4,
    }),
    10,
  );
});

test("batch reference selection still reserves one slot for the per-request source image", () => {
  assert.equal(
    getMaxReferenceImagesForSelection("gemini-3.1-flash-image-preview", {
      generationSemantics: "batch",
      sourceImageCount: 8,
    }),
    13,
  );
});
