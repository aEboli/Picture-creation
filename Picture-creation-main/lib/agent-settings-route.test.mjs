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
      FormData,
      setTimeout,
      clearTimeout,
    },
    { filename: filePath },
  );

  return module.exports;
}

test("agent settings route returns safe agent settings store and maps update errors to JSON", async () => {
  const nextResponseStub = {
    json(body, init) {
      return {
        body,
        status: init?.status ?? 200,
      };
    },
  };

  class AgentSettingsServiceError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }

  const routeModule = compileTsModule(path.join(projectRoot, "app", "api", "agent-settings", "route.ts"), {
    "next/server": {
      NextResponse: nextResponseStub,
    },
    "@/lib/server/agent-settings/service": {
      AgentSettingsServiceError,
      getAgentSettingsForQuery() {
        return {
          "image-analyst": {
            name: "图片分析师",
            description: "分析主体与卖点",
            systemPrompt: "You are an image analyst.",
            openingPrompt: "例如：分析一下这个主体。",
          },
          "prompt-engineer": {
            name: "提示词工程师",
            description: "输出营销感提示词",
            systemPrompt: "You are a prompt engineer.",
            openingPrompt: "例如：帮我写海报图提示词。",
          },
        };
      },
      updateAgentSettingsFromInput() {
        return {
          "image-analyst": {
            name: "新的图片分析师",
            description: "新的说明",
            systemPrompt: "new prompt",
            openingPrompt: "new opening",
          },
          "prompt-engineer": {
            name: "提示词工程师",
            description: "输出营销感提示词",
            systemPrompt: "You are a prompt engineer.",
            openingPrompt: "例如：帮我写海报图提示词。",
          },
        };
      },
    },
  });

  const successGet = await routeModule.GET();
  assert.equal(successGet.status, 200);
  assert.equal(successGet.body["image-analyst"].name, "图片分析师");

  const successPut = await routeModule.PUT({
    async json() {
      return {
        "image-analyst": {
          name: "新的图片分析师",
          description: "新的说明",
          systemPrompt: "new prompt",
          openingPrompt: "new opening",
        },
      };
    },
  });
  assert.equal(successPut.status, 200);
  assert.equal(successPut.body["image-analyst"].name, "新的图片分析师");

  const failingRouteModule = compileTsModule(path.join(projectRoot, "app", "api", "agent-settings", "route.ts"), {
    "next/server": {
      NextResponse: nextResponseStub,
    },
    "@/lib/server/agent-settings/service": {
      AgentSettingsServiceError,
      getAgentSettingsForQuery() {
        return {};
      },
      updateAgentSettingsFromInput() {
        throw new AgentSettingsServiceError("Invalid agent settings.", 400);
      },
    },
  });

  const failurePut = await failingRouteModule.PUT({
    async json() {
      return {};
    },
  });
  assert.equal(failurePut.status, 400);
  assert.equal(failurePut.body.error, "Invalid agent settings.");
});
