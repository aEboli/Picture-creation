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
    Buffer,
    File,
    FormData,
    setTimeout,
    clearTimeout,
  };

  vm.runInNewContext(transpiled, sandbox, { filename: filePath });
  return module.exports;
}

function buildSettings(overrides = {}) {
  return {
    defaultApiKey: "test-key",
    defaultTextModel: "gemini-3.1-flash-lite-preview",
    defaultImageModel: "gemini-3.1-flash-image-preview",
    defaultApiBaseUrl: "",
    defaultApiVersion: "v1beta",
    defaultApiHeaders: "",
    storageDir: "",
    maxConcurrency: 1,
    defaultUiLanguage: "zh",
    feishuSyncEnabled: false,
    feishuAppId: "",
    feishuAppSecret: "",
    feishuBitableAppToken: "",
    feishuBitableTableId: "",
    feishuUploadParentType: "bitable_image",
    feishuFieldMappingJson: "{}",
    agentSettingsJson: "{}",
    ...overrides,
  };
}

const defaultAgentSettingsStub = {
  "@/lib/agent-settings": {
    resolveAgentProfileSettings(rawJson, agentId) {
      const parsed = rawJson ? JSON.parse(rawJson) : {};
      const configured = parsed?.[agentId];
      if (configured) {
        return configured;
      }

      if (agentId === "prompt-engineer") {
        return {
          name: "提示词工程师",
          description: "输出营销感提示词",
          systemPrompt: "You are a concise prompt-engineering assistant for ecommerce image generation.",
          openingPrompt: "例如：帮我写海报图提示词。",
        };
      }

      return {
        name: "图片分析师",
        description: "分析主体与卖点",
        systemPrompt: "You are an objective ecommerce image analyst for a create-page form assistant.",
        openingPrompt: "例如：分析一下这个主体，提炼材质、结构和卖点。",
      };
    },
  },
};

test("runAgentChatFromFormData validates required fields and supported agent type", async () => {
  let requestCallCount = 0;
  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "server", "agent-chat", "service.ts"), {
    "server-only": {},
    "@/lib/db": {
      getSettings() {
        return buildSettings();
      },
    },
    ...defaultAgentSettingsStub,
    "@google/genai": {
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async () => {
              requestCallCount += 1;
              return { text: "{}" };
            },
          };
        }
      },
    },
  });

  const { runAgentChatFromFormData, AgentChatRequestError } = moduleExports;

  await assert.rejects(
    () => runAgentChatFromFormData(new FormData()),
    (error) => error instanceof AgentChatRequestError && error.status === 400 && /agentType/i.test(error.message),
  );

  const unsupported = new FormData();
  unsupported.append("agentType", "unknown-agent");
  unsupported.append("userText", "hello");
  await assert.rejects(
    () => runAgentChatFromFormData(unsupported),
    (error) => error instanceof AgentChatRequestError && error.status === 400 && /agentType/i.test(error.message),
  );

  const missingText = new FormData();
  missingText.append("agentType", "prompt-engineer");
  await assert.rejects(
    () => runAgentChatFromFormData(missingText),
    (error) => error instanceof AgentChatRequestError && error.status === 400 && /userText/i.test(error.message),
  );

  assert.equal(requestCallCount, 0);
});

test("runAgentChatFromFormData sends image/history context to Gemini and normalizes output mapping", async () => {
  const captured = {
    constructorConfig: null,
    request: null,
  };

  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "server", "agent-chat", "service.ts"), {
    "server-only": {},
    "@/lib/db": {
      getSettings() {
        return buildSettings({
          defaultApiBaseUrl: "https://example-gateway.invalid",
          defaultApiVersion: "v9",
          defaultApiHeaders: "{\"x-test\":\"ok\"}",
        });
      },
    },
    ...defaultAgentSettingsStub,
    "@google/genai": {
      GoogleGenAI: class {
        constructor(config) {
          captured.constructorConfig = config;
          this.models = {
            generateContent: async (request) => {
              captured.request = request;
              return {
                text: JSON.stringify({
                  assistantText: "It appears to be a stainless steel insulated tumbler with a lid.",
                  fieldMapping: {
                    productName: "Insulated tumbler",
                    materialInfo: "Stainless steel",
                  },
                }),
              };
            },
          };
        }
      },
    },
  });

  const { runAgentChatFromFormData } = moduleExports;

  const formData = new FormData();
  formData.append("agentType", "image-analyst");
  formData.append("userText", "Please analyze this product.");
  formData.append(
    "conversationHistory",
    JSON.stringify([
      { role: "user", text: "Last time we focused on capacity." },
      { role: "assistant", content: "Noted." },
    ]),
  );
  formData.append("image", new File(["fake"], "cup.png", { type: "image/png" }));

  const response = await runAgentChatFromFormData(formData);

  assert.equal(response.assistantText, "It appears to be a stainless steel insulated tumbler with a lid.");
  assert.equal(
    JSON.stringify(response.fieldMapping),
    JSON.stringify({
      productName: "Insulated tumbler",
      sellingPoints: "",
      materialInfo: "Stainless steel",
      sizeInfo: "",
      brandName: "",
    }),
  );

  assert.equal(captured.constructorConfig?.apiKey, "test-key");
  assert.equal(captured.constructorConfig?.apiVersion, "v9");
  assert.equal(captured.constructorConfig?.httpOptions?.baseUrl, "https://example-gateway.invalid");
  assert.equal(captured.constructorConfig?.httpOptions?.headers?.["x-test"], "ok");

  const requestText = captured.request?.contents?.find((part) => part && typeof part.text === "string")?.text ?? "";
  assert.match(requestText, /objective/i);
  assert.match(requestText, /conversation history/i);
  assert.ok(
    captured.request?.contents?.some(
      (part) => part?.inlineData?.mimeType === "image/png" && typeof part?.inlineData?.data === "string",
    ),
  );
});

test("runAgentChatFromFormData normalizes prompt-engineer promptSuggestions and keeps them structured", async () => {
  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "server", "agent-chat", "service.ts"), {
    "server-only": {},
    "@/lib/db": {
      getSettings() {
        return buildSettings();
      },
    },
    ...defaultAgentSettingsStub,
    "@google/genai": {
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async () => ({
              text: JSON.stringify({
                assistantText: "I drafted several prompt directions.",
                fieldMapping: {
                  productName: "",
                  sellingPoints: "",
                  materialInfo: "",
                  sizeInfo: "",
                  brandName: "",
                },
                promptSuggestions: ["  premium hero shot  ", "", null, "macro product detail", "   "],
              }),
            }),
          };
        }
      },
    },
  });

  const { runAgentChatFromFormData } = moduleExports;

  const formData = new FormData();
  formData.append("agentType", "prompt-engineer");
  formData.append("userText", "Give me three prompt directions.");

  const response = await runAgentChatFromFormData(formData);

  assert.equal(response.assistantText, "I drafted several prompt directions.");
  assert.deepEqual([...response.promptSuggestions], ["premium hero shot", "macro product detail"]);
});

test("runAgentChatFromFormData uses configured agent settings to replace the built-in system prompt", async () => {
  const captured = {
    request: null,
  };

  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "server", "agent-chat", "service.ts"), {
    "server-only": {},
    "@/lib/db": {
      getSettings() {
        return buildSettings({
          agentSettingsJson: JSON.stringify({
            "prompt-engineer": {
              name: "海报提示词顾问",
              description: "只输出海报风格提示词",
              systemPrompt: "You are a poster-only assistant. Always focus on poster composition.",
              openingPrompt: "例如：帮我写海报图提示词。",
            },
          }),
        });
      },
    },
    ...defaultAgentSettingsStub,
    "@google/genai": {
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async (request) => {
              captured.request = request;
              return {
                text: JSON.stringify({
                  assistantText: "Poster suggestions ready.",
                  fieldMapping: {},
                  promptSuggestions: [],
                }),
              };
            },
          };
        }
      },
    },
  });

  const { runAgentChatFromFormData } = moduleExports;

  const formData = new FormData();
  formData.append("agentType", "prompt-engineer");
  formData.append("userText", "Help me improve this.");

  await runAgentChatFromFormData(formData);

  const requestText = captured.request?.contents?.find((part) => part && typeof part.text === "string")?.text ?? "";
  assert.match(requestText, /poster-only assistant/i);
  assert.doesNotMatch(requestText, /concise prompt-engineering assistant/i);
});

test("runAgentChatFromFormData rejects malformed conversation history", async () => {
  const moduleExports = compileTsModule(path.join(projectRoot, "lib", "server", "agent-chat", "service.ts"), {
    "server-only": {},
    "@/lib/db": {
      getSettings() {
        return buildSettings();
      },
    },
    ...defaultAgentSettingsStub,
    "@google/genai": {
      GoogleGenAI: class {
        constructor() {
          this.models = {
            generateContent: async () => ({ text: "{}" }),
          };
        }
      },
    },
  });

  const { runAgentChatFromFormData, AgentChatRequestError } = moduleExports;

  const formData = new FormData();
  formData.append("agentType", "prompt-engineer");
  formData.append("userText", "Help me.");
  formData.append("conversationHistory", "{");

  await assert.rejects(
    () => runAgentChatFromFormData(formData),
    (error) =>
      error instanceof AgentChatRequestError &&
      error.status === 400 &&
      /conversation history/i.test(error.message),
  );
});
