import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("npm start uses the standalone server wrapper instead of next start", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));

  assert.equal(packageJson.scripts.start, "node scripts/start-standalone-server.mjs");
  assert.notEqual(packageJson.scripts.start, "next start");
});

test("standalone start wrapper supports documented hostname and port arguments", () => {
  const wrapper = fs.readFileSync(path.join(projectRoot, "scripts", "start-standalone-server.mjs"), "utf8");

  assert.match(wrapper, /--hostname/);
  assert.match(wrapper, /--port/);
  assert.match(wrapper, /process\.env\.HOSTNAME/);
  assert.match(wrapper, /process\.env\.PORT/);
  assert.match(wrapper, /\.next[\\/]standalone[\\/]server\.js/);
});
