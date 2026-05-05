import test from "node:test";
import assert from "node:assert/strict";

import { ASPECT_RATIOS } from "./constants.ts";
import { dimensionsForVariant } from "./utils.ts";

function ratioValue(ratio) {
  const [left, right] = ratio.split(":").map(Number);
  return (left || 1) / (right || 1);
}

test("1K dimensions use 1024 as the shortest side for every supported ratio", () => {
  for (const option of ASPECT_RATIOS) {
    const dimensions = dimensionsForVariant(option.value, "1K");

    assert.equal(
      Math.min(dimensions.width, dimensions.height),
      1024,
      `${option.value} should keep the shortest side at 1024`,
    );
    assert.ok(
      Math.abs(dimensions.width / dimensions.height - ratioValue(option.value)) < 0.002,
      `${option.value} should preserve the requested aspect ratio`,
    );
  }
});

test("1K dimensions expand non-square ratios from a 1024 shortest side", () => {
  assert.deepEqual(dimensionsForVariant("1:1", "1K"), { width: 1024, height: 1024 });
  assert.deepEqual(dimensionsForVariant("4:5", "1K"), { width: 1024, height: 1280 });
  assert.deepEqual(dimensionsForVariant("16:9", "1K"), { width: 1820, height: 1024 });
  assert.deepEqual(dimensionsForVariant("1:8", "1K"), { width: 1024, height: 8192 });
  assert.deepEqual(dimensionsForVariant("8:1", "1K"), { width: 8192, height: 1024 });
});
