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

function readSource(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("layout source provides a lightweight runtime snapshot seed instead of heavy runtime reads", () => {
  const layoutContent = readSource("app", "layout.tsx");

  assert.match(layoutContent, /RuntimeSnapshotProvider/);
  assert.match(layoutContent, /getRuntimeHeaderSnapshot/);
  assert.match(layoutContent, /const seedSnapshot = getRuntimeHeaderSnapshot\(\);/);
  assert.match(layoutContent, /<RuntimeSnapshotProvider seedSnapshot=\{seedSnapshot\}>/);
  assert.match(layoutContent, /<Navigation language=\{language\} \/>/);
  assert.doesNotMatch(layoutContent, /ensureRuntimeReady/);
  assert.doesNotMatch(layoutContent, /getHomePageData/);
  assert.doesNotMatch(layoutContent, /getHistoryHeaderSummary/);
});

test("navigation source consumes summary and integrations from runtime snapshot context", () => {
  const navigationContent = readSource("components", "navigation.tsx");

  assert.match(navigationContent, /useRuntimeSnapshot/);
  assert.match(navigationContent, /const \{ snapshot \} = useRuntimeSnapshot\(\);/);
  assert.match(navigationContent, /summary.totalJobs/);
  assert.match(navigationContent, /integrations.gemini/);
  assert.match(
    navigationContent,
    /export function Navigation\(\{\s*language\s*\}:\s*\{\s*language:\s*UiLanguage\s*\}\s*\)/,
  );
  assert.doesNotMatch(navigationContent, /summary:\s*\{/);
  assert.doesNotMatch(navigationContent, /integrations:\s*\{/);
});

test("runtime snapshot provider source refreshes on mount, visibility change, and 30s visible polling", () => {
  const providerContent = readSource("components", "runtime-snapshot-provider.tsx");

  assert.match(providerContent, /fetch\("\/api\/runtime\/header-snapshot"/);
  assert.match(providerContent, /void refreshSnapshot\(\);/);
  assert.match(providerContent, /document\.addEventListener\("visibilitychange", handleVisibilityChange\)/);
  assert.match(providerContent, /if \(document\.hidden\)/);
  assert.match(providerContent, /window\.setInterval\(\(\) => \{\s*void refreshSnapshot\(\);\s*\},\s*30_000\)/);
  assert.match(providerContent, /window\.clearInterval\(pollTimer\)/);
});

test("home page source renders status chips from the shared runtime snapshot consumer", () => {
  const pageContent = readSource("app", "page.tsx");

  assert.match(pageContent, /HomePageStatusChips/);
  assert.match(pageContent, /<HomePageStatusChips language=\{language\} \/>/);
  assert.doesNotMatch(pageContent, /const statusChips = \[/);
  assert.doesNotMatch(pageContent, /state:\s*integrations\./);
});
