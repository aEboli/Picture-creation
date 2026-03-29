import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("types and db schema include agent settings persistence", () => {
  const typesContent = read("lib", "types.ts");
  const dbContent = read("lib", "db.ts");

  assert.match(typesContent, /export type AgentId = "image-analyst" \| "prompt-engineer";/);
  assert.match(typesContent, /export interface AgentProfileSettings \{/);
  assert.match(typesContent, /export type AgentSettingsStore = Record<AgentId, AgentProfileSettings>;/);
  assert.match(typesContent, /agentSettingsJson: string;/);

  assert.match(dbContent, /agent_settings_json/);
  assert.match(dbContent, /ALTER TABLE settings ADD COLUMN agent_settings_json TEXT NOT NULL DEFAULT '\{\}'/);
});

test("agent panel fetches safe agent settings and exposes a settings view", () => {
  const panelContent = read("components", "create-agent-panel.tsx");

  assert.match(panelContent, /fetch\("\/api\/agent-settings"/);
  assert.match(panelContent, /historyView === "settings"/);
  assert.match(panelContent, /create-agent-settings-button/);
  assert.match(panelContent, /create-agent-settings-form/);
  assert.match(panelContent, /systemPrompt/);
  assert.match(panelContent, /openingPrompt/);
  assert.match(panelContent, /handleSaveAgentSettings/);
  assert.match(panelContent, /handleResetAgentSettings/);
});

test("agent chat service resolves configured agent system prompts from settings", () => {
  const serviceContent = read("lib", "server", "agent-chat", "service.ts");

  assert.match(serviceContent, /resolveAgentProfileSettings/);
  assert.match(serviceContent, /settings\.agentSettingsJson/);
  assert.match(serviceContent, /buildUserPrompt/);
});
