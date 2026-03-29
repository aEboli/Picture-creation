import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function compileTsModule(filePath, stubs) {
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
        if (Object.prototype.hasOwnProperty.call(stubs, specifier)) {
          return stubs[specifier];
        }
        throw new Error(`Missing stub for import "${specifier}" while evaluating ${filePath}`);
      },
      __filename: filePath,
      __dirname: path.dirname(filePath),
      console,
      process,
    },
    { filename: filePath },
  );

  return module.exports;
}

const helperPath = path.join(projectRoot, "lib", "agent-settings.ts");
const helperStubs = {
  "@/lib/types": {},
};

test("resolveAgentSettingsStore returns default built-in agent settings when raw JSON is empty", () => {
  const moduleExports = compileTsModule(helperPath, helperStubs);

  const store = moduleExports.resolveAgentSettingsStore("");

  assert.equal(store["image-analyst"].name, "图片分析师");
  assert.equal(store["prompt-engineer"].name, "提示词工程师");
  assert.match(store["image-analyst"].systemPrompt, /objective ecommerce image analyst/i);
});

test("resolveAgentSettingsStore merges stored overrides onto defaults", () => {
  const moduleExports = compileTsModule(helperPath, helperStubs);

  const store = moduleExports.resolveAgentSettingsStore(
    JSON.stringify({
      "prompt-engineer": {
        name: "海报提示词顾问",
        description: "帮我做更强营销感的构图建议",
        systemPrompt: "You are a poster-only agent.",
        openingPrompt: "例如：帮我写一条海报图提示词。",
      },
    }),
  );

  assert.equal(store["prompt-engineer"].name, "海报提示词顾问");
  assert.equal(store["prompt-engineer"].systemPrompt, "You are a poster-only agent.");
  assert.equal(store["image-analyst"].name, "图片分析师");
});

test("sanitizeAgentSettingsUpdate rejects unknown agent ids and preserves empty strings", () => {
  const moduleExports = compileTsModule(helperPath, helperStubs);

  assert.throws(
    () =>
      moduleExports.sanitizeAgentSettingsUpdate({
        "unknown-agent": {
          name: "x",
          description: "x",
          systemPrompt: "x",
          openingPrompt: "x",
        },
      }),
    /agent/i,
  );

  const sanitized = moduleExports.sanitizeAgentSettingsUpdate({
    "image-analyst": {
      name: "",
      description: "",
      systemPrompt: "",
      openingPrompt: "",
    },
  });

  assert.equal(
    JSON.stringify(sanitized["image-analyst"]),
    JSON.stringify({
      name: "",
      description: "",
      systemPrompt: "",
      openingPrompt: "",
    }),
  );
});
