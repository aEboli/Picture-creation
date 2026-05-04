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

test("app shell renders a top-right service configuration gear and keeps the full settings page route", () => {
  const layout = read("app", "layout.tsx");
  const drawer = read("components", "service-settings-drawer.tsx");
  const sidebar = read("components", "sidebar-nav.tsx");
  const settingsPage = read("app", "settings", "page.tsx");

  assert.match(layout, /ServiceSettingsDrawer/);
  assert.match(layout, /getServiceDrawerSettingsForQuery/);
  assert.match(layout, /initialSettings=\{serviceDrawerSettings\}/);
  assert.doesNotMatch(layout, /initialSettings=\{settings\}/);
  assert.match(drawer, /className="service-settings-gear"/);
  assert.match(drawer, /aria-label=\{text\.open\}/);
  assert.match(drawer, /href="\/settings"/);
  assert.match(settingsPage, /<SettingsForm\b/);
  assert.doesNotMatch(sidebar, /href:\s*"\/settings"/);
});

test("service configuration drawer does not expose JSON request headers or mapping textareas", () => {
  const drawer = read("components", "service-settings-drawer.tsx");

  assert.match(drawer, /服务配置/);
  assert.match(drawer, /Service Configuration/);
  assert.doesNotMatch(drawer, /text\.labels\.defaultApiHeaders|formState\.defaultApiHeaders|patchSettings\(\{\s*defaultApiHeaders/);
  assert.doesNotMatch(drawer, /text\.labels\.feishuFieldMappingJson|formState\.feishuFieldMappingJson|patchSettings\(\{\s*feishuFieldMappingJson/);
  assert.doesNotMatch(drawer, /请求头 JSON|headers JSON|字段映射 JSON|mapping JSON/);
  assert.doesNotMatch(drawer, /textarea/);
});

test("service configuration drawer receives redacted secrets and stores API credentials in browser settings", () => {
  const drawer = read("components", "service-settings-drawer.tsx");
  const queries = read("lib", "server", "workspace", "queries.ts");
  const service = read("lib", "server", "settings", "service.ts");

  assert.match(queries, /defaultApiKey:\s*""/);
  assert.match(queries, /defaultApiHeaders:\s*""/);
  assert.match(queries, /feishuAppSecret:\s*""/);
  assert.match(queries, /hasExistingDefaultApiKey:\s*Boolean\(settings\.defaultApiKey\.trim\(\)\)/);
  assert.match(drawer, /buildSettingsPayloadForSave/);
  assert.match(drawer, /readBrowserApiSettings/);
  assert.match(drawer, /writeBrowserApiSettings/);
  assert.match(drawer, /payload\.defaultProvider\s*=\s*"openai"/);
  assert.match(drawer, /payload\.defaultApiKey\s*=\s*""/);
  assert.match(drawer, /payload\.defaultApiBaseUrl\s*=\s*""/);
  assert.match(drawer, /payload\.defaultApiHeaders\s*=\s*""/);
  assert.match(drawer, /delete payload\.feishuAppSecret/);
  assert.match(service, /mergeSettingsForSecretAwareRequest/);
});

test("top-right service gear and agent entry use separated floating slots", () => {
  const css = read("app", "ui-ux-pro-max.css");

  assert.match(css, /TOP RIGHT FLOATING CONTROLS PASS/);
  assert.match(
    css,
    /\.sidebar-agent-panel\s*\{[\s\S]*?top:\s*16px;[\s\S]*?right:\s*18px;[\s\S]*?z-index:\s*2300;/,
  );
  assert.match(css, /\.service-settings-gear\s*\{[\s\S]*?top:\s*16px;[\s\S]*?right:\s*112px;/);
  assert.match(
    css,
    /@media \(max-width:\s*720px\)\s*\{[\s\S]*?\.sidebar-agent-panel\s*\{[\s\S]*?top:\s*12px;[\s\S]*?right:\s*12px;[\s\S]*?\.service-settings-gear\s*\{[\s\S]*?top:\s*12px;[\s\S]*?right:\s*104px;/,
  );
});
