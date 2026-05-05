import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compileTsModule(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };

  vm.runInNewContext(
    transpiled,
    {
      module,
      exports: module.exports,
      require: (specifier) => {
        throw new Error(`Unexpected import "${specifier}" while evaluating ${filePath}`);
      },
      __filename: filePath,
      __dirname: path.dirname(filePath),
      console,
      process,
      Math,
      Date,
    },
    { filename: filePath },
  );

  return module.exports;
}

test("readCreateDraftIdFromDraftJson returns stored draftId when present", () => {
  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "create-agent-history.ts"));

  assert.equal(
    moduleExports.readCreateDraftIdFromDraftJson(JSON.stringify({ draftId: "draft_123" })),
    "draft_123",
  );
});

test("writeAgentHistoryBucket keeps histories isolated by draftId and agent type", () => {
  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "create-agent-history.ts"));

  const firstDraft = moduleExports.writeAgentHistoryBucket(null, "draft_a", "image-analyst", [
    {
      id: "msg_1",
      role: "user",
      agent: "image-analyst",
      text: "hello",
      createdAt: "2026-03-28T12:00:00.000Z",
      previewDataUrl: "data:image/png;base64,AAA",
    },
  ]);
  const secondDraft = moduleExports.writeAgentHistoryBucket(firstDraft, "draft_b", "prompt-engineer", [
    {
      id: "msg_2",
      role: "agent",
      agent: "prompt-engineer",
      text: "reply",
      createdAt: "2026-03-28T12:01:00.000Z",
      promptSuggestions: ["prompt a"],
    },
  ]);

  assert.equal(
    JSON.stringify(moduleExports.readAgentHistoryBucket(secondDraft, "draft_a", "image-analyst").map((message) => message.id)),
    JSON.stringify(["msg_1"]),
  );
  assert.equal(
    JSON.stringify(moduleExports.readAgentHistoryBucket(secondDraft, "draft_b", "prompt-engineer").map((message) => message.id)),
    JSON.stringify(["msg_2"]),
  );
  assert.equal(
    JSON.stringify(moduleExports.readAgentHistoryBucket(secondDraft, "draft_a", "prompt-engineer").map((message) => message.id)),
    JSON.stringify([]),
  );
});

test("normalizeAgentHistoryMessages strips invalid entries and preserves mapped content only", () => {
  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "create-agent-history.ts"));

  const normalized = moduleExports.normalizeAgentHistoryMessages([
    null,
    {
      id: "msg_valid",
      role: "agent",
      agent: "prompt-engineer",
      text: "  useful reply  ",
      createdAt: "2026-03-28T12:01:00.000Z",
      fields: { productName: "  Fish lure  ", brandName: "" },
      promptSuggestions: ["  prompt a  ", "", "prompt b"],
      imageFileName: "should-not-persist.png",
      previewDataUrl: "data:image/png;base64,BBB",
    },
    {
      id: "",
      role: "user",
      agent: "image-analyst",
      text: "",
      createdAt: "",
    },
  ]);

  assert.equal(
    JSON.stringify(normalized),
    JSON.stringify([
      {
        id: "msg_valid",
        role: "agent",
        agent: "prompt-engineer",
        text: "useful reply",
        createdAt: "2026-03-28T12:01:00.000Z",
        fields: { productName: "Fish lure" },
        promptSuggestions: ["prompt a", "prompt b"],
        previewDataUrl: "data:image/png;base64,BBB",
      },
    ]),
  );
});
