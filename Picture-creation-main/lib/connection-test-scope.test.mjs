import test from "node:test";
import assert from "node:assert/strict";

import { shouldTestFeishuConnection } from "./connection-test-scope.ts";

test("skips Feishu connection test when sync is disabled and credentials are empty", () => {
  assert.equal(
    shouldTestFeishuConnection({
      feishuSyncEnabled: false,
      feishuAppId: "",
      feishuAppSecret: "",
      feishuBitableAppToken: "",
      feishuBitableTableId: "",
    }),
    false,
  );
});

test("tests Feishu connection when sync is enabled or any credential field is present", () => {
  assert.equal(
    shouldTestFeishuConnection({
      feishuSyncEnabled: true,
      feishuAppId: "",
      feishuAppSecret: "",
      feishuBitableAppToken: "",
      feishuBitableTableId: "",
    }),
    true,
  );

  assert.equal(
    shouldTestFeishuConnection({
      feishuSyncEnabled: false,
      feishuAppId: "cli_xxx",
      feishuAppSecret: "",
      feishuBitableAppToken: "",
      feishuBitableTableId: "",
    }),
    true,
  );
});
