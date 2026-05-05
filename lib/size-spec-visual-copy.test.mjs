import test from "node:test";
import assert from "node:assert/strict";

import { buildSizeSpecVisualCopyLines } from "./templates.ts";

test("size spec helper converts metric dimensions into metric/imprerial slash copy with labels", () => {
  const lines = buildSizeSpecVisualCopyLines({
    sizeInfo: "2.54cm x 5.08cm",
    language: "zh-CN",
  });

  assert.deepEqual(lines, ["长 5.08cm/2in", "宽 2.54cm/1in"]);
});

test("size spec helper infers repeated dimension units from compact notation", () => {
  const lines = buildSizeSpecVisualCopyLines({
    sizeInfo: "12x3cm, 35g",
    language: "zh-CN",
  });

  assert.deepEqual(lines, ["长 12cm/4.72in", "宽 3cm/1.18in", "重量 35g/1.23oz"]);
});

test("size spec helper maps longest edge to length, shortest edge to width, and middle edge to height", () => {
  const lines = buildSizeSpecVisualCopyLines({
    sizeInfo: "3x12x6cm",
    language: "zh-CN",
  });

  assert.deepEqual(lines, ["长 12cm/4.72in", "高 6cm/2.36in", "宽 3cm/1.18in"]);
});

test("size spec helper supports weight and english labels", () => {
  const lines = buildSizeSpecVisualCopyLines({
    sizeInfo: "4in x 2in, 15g",
    language: "en-US",
  });

  assert.deepEqual(lines, ["Length 10.16cm/4in", "Width 5.08cm/2in", "Weight 15g/0.53oz"]);
});
