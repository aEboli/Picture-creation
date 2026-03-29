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

test("create form source uses one unified structured field block for standard, suite, and amazon modes", () => {
  const uiContent = read(sourcePath("components", "create-job-form.tsx"));

  assert.match(uiContent, /const isStructuredCommerceMode = payload\.creationMode === "standard" \|\| payload\.creationMode === "suite" \|\| payload\.creationMode === "amazon-a-plus";/);
  assert.match(uiContent, /const commerceProductNameLabel = language === "zh" \? "图片名（必填）" : "Image name \(required\)";/);
  assert.match(uiContent, /const commerceSellingPointsLabel = language === "zh" \? "卖点（选填）" : "Selling points \(optional\)";/);
  assert.match(uiContent, /const commerceMaterialInfoLabel = language === "zh" \? "材质（选填）" : "Material \(optional\)";/);
  assert.match(uiContent, /const commerceSizeInfoLabel = language === "zh" \? "尺寸规格（选填）" : "Size \/ specs \(optional\)";/);
  assert.match(uiContent, /const commerceBrandNameLabel = language === "zh" \? "品牌名（选填）" : "Brand name \(optional\)";/);
  assert.match(uiContent, /<span>\{commerceSellingPointsLabel\}<\/span>[\s\S]*<span>\{commerceMaterialInfoLabel\}<\/span>[\s\S]*<span>\{commerceSizeInfoLabel\}<\/span>[\s\S]*<span>\{commerceBrandNameLabel\}<\/span>/);
  assert.doesNotMatch(uiContent, /payload\.creationMode === "suite"[\s\S]*<span>\{text\.category\}<\/span>/);
  assert.doesNotMatch(uiContent, /payload\.creationMode === "amazon-a-plus"[\s\S]*<span>\{text\.category\}<\/span>/);
  assert.doesNotMatch(uiContent, /payload\.creationMode === "standard"[\s\S]*<span>\{text\.category\}<\/span>/);
});
