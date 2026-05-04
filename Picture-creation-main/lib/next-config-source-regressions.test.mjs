import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("next config keeps Turbopack rooted at the app project for standalone startup", () => {
  const configContent = fs.readFileSync(path.join(projectRoot, "next.config.ts"), "utf8");

  assert.doesNotMatch(configContent, /path\.join\(process\.cwd\(\), "\.\."\)/);
  assert.match(configContent, /turbopack:\s*\{[\s\S]*root:\s*process\.cwd\(\)/);
});
