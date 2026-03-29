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

  const sandbox = {
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
  };

  vm.runInNewContext(transpiled, sandbox, { filename: filePath });
  return module.exports;
}

test("agent chat route maps request errors to JSON status and returns assistant payload on success", async () => {
  const nextResponseStub = {
    json(body, init) {
      return {
        body,
        status: init?.status ?? 200,
      };
    },
  };

  class AgentChatRequestError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }

  const routeModule = compileTsModule(path.join(projectRoot, "app", "api", "agent-chat", "route.ts"), {
    "next/server": {
      NextResponse: nextResponseStub,
    },
    "@/lib/server/agent-chat/service": {
      AgentChatRequestError,
      async runAgentChatFromFormData() {
        return {
          assistantText: "Use concrete product nouns and keep constraints explicit.",
          fieldMapping: {
            productName: "Outdoor torch",
            sellingPoints: "IP68 waterproof; 1000 lm",
            materialInfo: "Aluminum alloy",
            sizeInfo: "Length 12 cm",
            brandName: "Acme",
          },
        };
      },
    },
  });

  const success = await routeModule.POST({
    async formData() {
      return new FormData();
    },
  });

  assert.equal(success.status, 200);
  assert.equal(success.body.assistantText, "Use concrete product nouns and keep constraints explicit.");
  assert.equal(success.body.fieldMapping.brandName, "Acme");

  const failingRouteModule = compileTsModule(path.join(projectRoot, "app", "api", "agent-chat", "route.ts"), {
    "next/server": {
      NextResponse: nextResponseStub,
    },
    "@/lib/server/agent-chat/service": {
      AgentChatRequestError,
      async runAgentChatFromFormData() {
        throw new AgentChatRequestError("agentType is required", 400);
      },
    },
  });

  const failure = await failingRouteModule.POST({
    async formData() {
      return new FormData();
    },
  });

  assert.equal(failure.status, 400);
  assert.equal(failure.body.error, "agentType is required");
});
