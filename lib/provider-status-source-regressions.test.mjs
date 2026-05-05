import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function findProjectRoot(startDir) {
  let currentDir = startDir;

  for (;;) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));

function read(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("global API status probe follows the saved provider type instead of always probing Gemini", () => {
  const queries = read("lib", "server", "workspace", "queries.ts");

  assert.match(queries, /import\s+\{\s*resolveProviderType\s*\}\s+from\s+"@\/lib\/provider-router"/);
  assert.match(queries, /defaultProvider:\s*settings\.defaultProvider/);
  assert.match(queries, /resolveProviderType\(settings\.defaultProvider\)/);
  assert.match(queries, /testOpenAIConnection/);
  assert.doesNotMatch(queries, /probeGeminiIntegration\(settings\)/);
});

test("settings save and connection test clear stale global status and refresh the shell", () => {
  const settingsRoute = read("app", "api", "settings", "route.ts");
  const testRoute = read("app", "api", "settings", "test", "route.ts");
  const testFeishuRoute = read("app", "api", "settings", "test-feishu", "route.ts");
  const settingsForm = read("components", "settings-form.tsx");
  const serviceDrawer = read("components", "service-settings-drawer.tsx");

  assert.match(settingsRoute, /clearIntegrationProbeCache\(\)/);
  assert.match(testRoute, /clearIntegrationProbeCache\(\)/);
  assert.match(testFeishuRoute, /clearIntegrationProbeCache\(\)/);
  assert.match(settingsForm, /const router = useRouter\(\)/);
  assert.match(settingsForm, /router\.refresh\(\)/);
  assert.match(serviceDrawer, /const router = useRouter\(\)/);
  assert.match(serviceDrawer, /router\.refresh\(\)/);
});

test("global connection test does not fail when optional Feishu sync is disabled and unconfigured", () => {
  const settingsForm = read("components", "settings-form.tsx");
  const serviceDrawer = read("components", "service-settings-drawer.tsx");

  assert.match(settingsForm, /shouldTestFeishuConnection\(formState\)/);
  assert.match(settingsForm, /text\.actions\.feishuSkipped/);
  assert.match(serviceDrawer, /shouldTestFeishuConnection\(formState\)/);
  assert.match(serviceDrawer, /text\.actions\.feishuSkipped/);
});

test("shared API configuration errors do not name Gemini when provider can vary", () => {
  const agentChatService = read("lib", "server", "agent-chat", "service.ts");

  assert.match(agentChatService, /API key and text model must be configured in Settings\./);
  assert.doesNotMatch(agentChatService, /Gemini API key and text model must be configured/);
});
