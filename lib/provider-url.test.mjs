import test from "node:test";
import assert from "node:assert/strict";

import { resolveProviderEndpoint } from "./provider-url.ts";

test("resolveProviderEndpoint keeps legacy base URL plus API version configuration", () => {
  assert.deepEqual(
    resolveProviderEndpoint({
      apiBaseUrl: "https://relay.example.test",
      apiVersion: "v1beta",
    }),
    {
      baseUrl: "https://relay.example.test",
      apiVersion: "v1beta",
    },
  );
});

test("resolveProviderEndpoint treats versioned API roots as complete URLs", () => {
  assert.deepEqual(
    resolveProviderEndpoint({
      apiBaseUrl: " https://relay.example.test/gemini/v1beta/ ",
      apiVersion: "v1",
    }),
    {
      baseUrl: "https://relay.example.test/gemini/v1beta",
      apiVersion: "",
    },
  );
});
