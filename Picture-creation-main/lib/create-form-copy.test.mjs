import test from "node:test";
import assert from "node:assert/strict";

import { formatImageCounter } from "./create-form-copy.ts";

test("zh image counter uses X/X format", () => {
  assert.equal(formatImageCounter("zh", 2, 5), "2/5");
});
