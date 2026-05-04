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

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sourcePath(...parts) {
  return path.join(projectRoot, ...parts);
}

test("theme toggle is shared by the shell and overview page", () => {
  const themeTogglePath = sourcePath("components", "theme-toggle.tsx");
  const sidebarNav = read(sourcePath("components", "sidebar-nav.tsx"));
  const homePage = read(sourcePath("app", "page.tsx"));
  const layout = read(sourcePath("app", "layout.tsx"));

  assert.equal(fs.existsSync(themeTogglePath), true);

  const themeToggle = read(themeTogglePath);
  assert.match(themeToggle, /PICTURE_CREATION_THEME_KEY\s*=\s*"picture-creation-theme"/);
  assert.match(themeToggle, /document\.documentElement\.dataset\.theme\s*=\s*theme/);
  assert.match(themeToggle, /localStorage\.setItem\(PICTURE_CREATION_THEME_KEY,\s*nextTheme\)/);
  assert.match(themeToggle, /白色/);
  assert.match(themeToggle, /深色/);

  assert.match(sidebarNav, /import \{ ThemeToggle \} from "@\/components\/theme-toggle";/);
  assert.match(sidebarNav, /<ThemeToggle language=\{language\} compact=\{collapsed\} \/>/);

  assert.match(homePage, /import \{ ThemeToggle \} from "@\/components\/theme-toggle";/);
  assert.match(homePage, /className="dashboard-theme-control"/);
  assert.match(homePage, /<ThemeToggle language=\{language\} \/>/);

  assert.match(layout, /suppressHydrationWarning/);
  assert.match(layout, /picture-creation-theme/);
});

test("light theme styles cover major surfaces and native controls", () => {
  const cssContent = read(sourcePath("app", "ui-ux-pro-max.css"));

  assert.match(cssContent, /LIGHT THEME PASS/);
  assert.match(cssContent, /html\[data-theme="light"\]\s*\{[\s\S]*color-scheme:\s*light;/);
  assert.match(cssContent, /html\[data-theme="light"\]\s*\{[\s\S]*--ui-bg:\s*#f7f8fb;/);
  assert.match(cssContent, /\.theme-toggle\s*\{/);
  assert.match(cssContent, /\.theme-toggle-button\.is-active\s*\{/);
  assert.match(cssContent, /html\[data-theme="light"\]\s+body\s*\{[\s\S]*background:/);
  assert.match(
    cssContent,
    /html\[data-theme="light"\]\s+:where\(input,\s*textarea,\s*select\)\s*\{/,
  );
  assert.match(cssContent, /html\[data-theme="light"\]\s+select\s*\{[\s\S]*color-scheme:\s*light;/);
  assert.match(cssContent, /html\[data-theme="light"\]\s+select option,/);
  assert.match(cssContent, /html\[data-theme="light"\]\s+input\[type="range"\]::-webkit-slider-thumb/);
  assert.match(cssContent, /html\[data-theme="light"\]\s+input\[type="range"\]::-moz-range-thumb/);
  assert.match(
    cssContent,
    /html\[data-theme="light"\]\s+:where\(\.panel,[\s\S]*\.service-settings-panel[\s\S]*\)\s*\{/,
  );
  assert.match(cssContent, /html\[data-theme="light"\]\s+\.create-area-tab\.is-active/);
  assert.match(cssContent, /html\[data-theme="light"\]\s+\.chip\.is-active/);
});
