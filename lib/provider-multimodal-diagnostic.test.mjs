import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMultimodalDiagnosticBranchConfig,
  buildMultimodalDiagnosticPrompt,
  buildMultimodalDiagnosticTextPrompt,
  MULTIMODAL_DIAGNOSTIC_REFERENCE,
  resolveMultimodalDiagnosticFinalVerdict,
  validateMultimodalDiagnosticTextProbeResponse,
  scoreMultimodalDiagnosticResponse,
} from "./gemini.ts";

const baseSettings = {
  defaultApiKey: "relay-key",
  defaultTextModel: "relay-model",
  defaultImageModel: "image-model",
  defaultApiBaseUrl: "https://relay.example.test",
  defaultApiVersion: "v1beta",
  defaultApiHeaders: '{"X-Relay":"1"}',
};

test("text probe prompt stays simple and separate from multimodal prompt", () => {
  const textPrompt = buildMultimodalDiagnosticTextPrompt();
  const multimodalPrompt = buildMultimodalDiagnosticPrompt(MULTIMODAL_DIAGNOSTIC_REFERENCE);

  assert.equal(textPrompt, "Reply with OK only.");
  assert.notEqual(multimodalPrompt, textPrompt);
  assert.match(multimodalPrompt, /centerToken/i);
  assert.match(multimodalPrompt, /confidenceNote/i);
});

test("relay branch keeps baseUrl and official branch clears it", () => {
  const relay = buildMultimodalDiagnosticBranchConfig("relay", baseSettings);
  const official = buildMultimodalDiagnosticBranchConfig("official", baseSettings);
  const officialWithOverrides = buildMultimodalDiagnosticBranchConfig("official", {
    ...baseSettings,
    officialApiKey: "official-key",
    officialTextModel: "official-model",
    officialApiVersion: "v1",
    officialApiHeaders: '{"X-Official":"1"}',
  });
  const officialWithBlankOverrides = buildMultimodalDiagnosticBranchConfig("official", {
    ...baseSettings,
    officialApiKey: "",
    officialTextModel: "",
    officialApiVersion: "",
    officialApiHeaders: "",
  });

  assert.equal(relay.branchName, "relay");
  assert.equal(relay.baseUrlUsed, baseSettings.defaultApiBaseUrl);
  assert.equal(relay.officialDirect, false);
  assert.equal(relay.apiHeaders, baseSettings.defaultApiHeaders);
  assert.equal(relay.apiKey, baseSettings.defaultApiKey);
  assert.equal(relay.model, baseSettings.defaultTextModel);

  assert.equal(official.branchName, "official");
  assert.equal(official.baseUrlUsed, null);
  assert.equal(official.officialDirect, true);
  assert.equal(official.apiHeaders, undefined);
  assert.equal(official.apiKey, baseSettings.defaultApiKey);
  assert.equal(official.model, baseSettings.defaultTextModel);

  assert.equal(officialWithOverrides.apiKey, "official-key");
  assert.equal(officialWithOverrides.model, "official-model");
  assert.equal(officialWithOverrides.apiVersion, "v1");
  assert.equal(officialWithOverrides.apiHeaders, '{"X-Official":"1"}');

  assert.equal(officialWithBlankOverrides.apiKey, baseSettings.defaultApiKey);
  assert.equal(officialWithBlankOverrides.model, baseSettings.defaultTextModel);
  assert.equal(officialWithBlankOverrides.apiVersion, baseSettings.defaultApiVersion);
  assert.equal(officialWithBlankOverrides.apiHeaders, undefined);
});

test("multimodal scoring distinguishes exact, partial, and no-vision responses", () => {
  const exact = scoreMultimodalDiagnosticResponse({
    expected: MULTIMODAL_DIAGNOSTIC_REFERENCE,
    rawText: JSON.stringify({
      ...MULTIMODAL_DIAGNOSTIC_REFERENCE,
      confidenceNote: "high confidence",
    }),
    jsonParsed: {
      ...MULTIMODAL_DIAGNOSTIC_REFERENCE,
      confidenceNote: "high confidence",
    },
  });
  const partial = scoreMultimodalDiagnosticResponse({
    expected: MULTIMODAL_DIAGNOSTIC_REFERENCE,
    rawText: JSON.stringify({
      ...MULTIMODAL_DIAGNOSTIC_REFERENCE,
      confidenceNote: "medium confidence",
      topRightColor: "blue",
    }),
    jsonParsed: {
      ...MULTIMODAL_DIAGNOSTIC_REFERENCE,
      confidenceNote: "medium confidence",
      topRightColor: "blue",
    },
  });
  const noVision = scoreMultimodalDiagnosticResponse({
    expected: MULTIMODAL_DIAGNOSTIC_REFERENCE,
    rawText: "I can only answer with text.",
    jsonParsed: null,
  });
  const confidenceOnly = scoreMultimodalDiagnosticResponse({
    expected: MULTIMODAL_DIAGNOSTIC_REFERENCE,
    rawText: JSON.stringify({
      confidenceNote: "high confidence",
    }),
    jsonParsed: {
      confidenceNote: "high confidence",
    },
  });

  assert.equal(exact.classification, "exact_match");
  assert.equal(partial.classification, "partial_match");
  assert.equal(noVision.classification, "text_only_or_no_vision");
  assert.equal(confidenceOnly.classification, "text_only_or_no_vision");
  assert.equal(confidenceOnly.score.exactFieldCount, 0);
  assert.ok(exact.score.exactFieldCount > partial.score.exactFieldCount);
});

test("text probe response must normalize to OK exactly", () => {
  assert.equal(validateMultimodalDiagnosticTextProbeResponse("OK").ok, true);
  assert.equal(validateMultimodalDiagnosticTextProbeResponse(" OK \n").ok, true);
  assert.equal(validateMultimodalDiagnosticTextProbeResponse("OKAY").ok, false);
  assert.equal(validateMultimodalDiagnosticTextProbeResponse("").ok, false);
});

test("final verdict maps relay success, relay text-only failure, and official inconclusive", () => {
  assert.equal(
    resolveMultimodalDiagnosticFinalVerdict({
      relay: {
        textProbe: { ok: true },
        multimodalProbe: { classification: "exact_match" },
      },
      official: {
        textProbe: { ok: true },
        multimodalProbe: { classification: "request_failed" },
      },
    }),
    "relay_multimodal_ok",
  );

  assert.equal(
    resolveMultimodalDiagnosticFinalVerdict({
      relay: {
        textProbe: { ok: true },
        multimodalProbe: { classification: "text_only_or_no_vision" },
      },
      official: {
        textProbe: { ok: true },
        multimodalProbe: { classification: "request_failed" },
      },
    }),
    "relay_text_ok_but_multimodal_failed",
  );

  assert.equal(
    resolveMultimodalDiagnosticFinalVerdict({
      relay: {
        textProbe: { ok: false },
        multimodalProbe: { classification: "request_failed" },
      },
      official: {
        textProbe: { ok: true },
        multimodalProbe: { classification: "request_failed" },
      },
    }),
    "official_inconclusive",
  );
});
