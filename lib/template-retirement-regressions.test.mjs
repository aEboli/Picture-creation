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

test("template APIs are retired behind a gone response", () => {
  const collectionRoute = readSource("app", "api", "templates", "route.ts");
  const detailRoute = readSource("app", "api", "templates", "[id]", "route.ts");
  const matchRoute = readSource("app", "api", "templates", "match", "route.ts");

  assert.match(collectionRoute, /status:\s*410/);
  assert.match(detailRoute, /status:\s*410/);
  assert.match(matchRoute, /status:\s*410/);
  assert.match(collectionRoute, /Template center has been retired\./);
  assert.match(detailRoute, /Template center has been retired\./);
  assert.match(matchRoute, /Template center has been retired\./);
});

test("overview surfaces no template center entry points", () => {
  const navigation = readSource("components", "navigation.tsx");
  const homepage = readSource("app", "page.tsx");

  assert.doesNotMatch(navigation, /href:\s*"\/templates"/);
  assert.doesNotMatch(homepage, /href:\s*"\/templates"/);
  assert.doesNotMatch(homepage, /stats\.templates/);
  assert.doesNotMatch(homepage, /overview-slot-templates/);
});

test("templates page no longer mounts the template editor", () => {
  const templatesPage = readSource("app", "templates", "page.tsx");

  assert.match(templatesPage, /notFound\(/);
  assert.doesNotMatch(templatesPage, /TemplateCenterClient/);
  assert.doesNotMatch(templatesPage, /getTemplatesPageData/);
});

test("workspace read models no longer expose template center data hooks", () => {
  const workspaceStore = readSource("lib", "server", "workspace", "store.ts");
  const workspaceQueries = readSource("lib", "server", "workspace", "queries.ts");

  assert.doesNotMatch(workspaceStore, /listTemplatesSnapshot/);
  assert.doesNotMatch(workspaceStore, /listTemplates,/);
  assert.doesNotMatch(workspaceQueries, /TemplatesPageData/);
  assert.doesNotMatch(workspaceQueries, /getTemplatesPageData/);
  assert.doesNotMatch(workspaceQueries, /readTemplatesPageData/);
  assert.doesNotMatch(workspaceQueries, /listTemplatesSnapshot/);
});

test("db init path retires legacy templates and no longer seeds defaults", () => {
  const db = readSource("lib", "db.ts");

  assert.doesNotMatch(db, /getTemplateSeedData/);
  assert.doesNotMatch(db, /ensureDefaultTemplateSeeds/);
  assert.match(db, /templates_retired/);
  assert.match(db, /DELETE FROM templates/);
  assert.match(db, /UPDATE settings SET templates_retired = 1/);
});
