import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(...parts) {
  return fs.readFileSync(path.join(projectRoot, ...parts), "utf8");
}

test("navigation only renders create-agent entry on /create and places it in header", () => {
  const content = read("components", "navigation.tsx");

  assert.match(content, /const isCreatePage = normalizedPathname === "\/create";/);
  assert.match(content, /className="app-header-center-cluster">[\s\S]*className="app-header-agent-slot"[\s\S]*className="app-header-nav-shell"/);
  assert.match(content, /\{isCreatePage \? \([\s\S]*<CreateAgentPanel \/>\s*[\s\S]*\) : null\}/);
});

test("create-agent panel uses local conversation state and calls the backend chat route", () => {
  const content = read("components", "create-agent-panel.tsx");

  assert.match(content, /const CREATE_FORM_MAPPING_EVENT = "create-agent:map-to-form";/);
  assert.match(content, /createPortal\(/);
  assert.match(content, /document\.body/);
  assert.match(content, /const CREATE_AGENT_DRAFT_CONTEXT_EVENT = "create-agent:draft-context";/);
  assert.match(content, /const CREATE_AGENT_HISTORY_KEY = "commerce-image-studio.create-agent-history.v1";/);
  assert.match(content, /const \[messages, setMessages\] = useState<AgentMessage\[]>\(\[\]\);/);
  assert.match(content, /const \[isSending, setIsSending\] = useState\(false\);/);
  assert.match(content, /const \[historyView, setHistoryView\] = useState/);
  assert.match(content, /const \[pendingHistoryMapDetail, setPendingHistoryMapDetail\] = useState/);
  assert.match(content, /const \[lightboxIndex, setLightboxIndex\] = useState/);
  assert.match(content, /fetch\("\/api\/agent-chat"/);
  assert.match(content, /conversationHistory/);
  assert.match(content, /映射到表单/);
  assert.match(content, /DEFAULT_AGENT_SETTINGS_STORE/);
  assert.match(content, /agentSettings\[agentId]\?\.name/);
  assert.match(content, /promptSuggestions\?: string\[\];/);
  assert.match(content, /agentType:\s*(message\.agent|detail\.agentType|agent),/);
  assert.match(content, /promptSuggestions: body\.promptSuggestions,/);
  assert.match(content, /window\.addEventListener\(CREATE_AGENT_DRAFT_CONTEXT_EVENT,/);
  assert.match(content, /readAgentHistoryBucket\(/);
  assert.match(content, /writeAgentHistoryBucket\(/);
  assert.match(content, /readAgentHistoryBucket\(rawHistory, currentDraftId, agent\)/);
  assert.match(content, /writeAgentHistoryBucket\([\s\S]*currentDraftId,[\s\S]*agent,/);
  assert.match(content, /previewDataUrl/);
  assert.match(content, /createImagePreviewDataUrl\(/);
  assert.match(content, /setCurrentDraftId\(\(current\) => \{/);
  assert.match(content, /current && nextDraftId && current !== nextDraftId/);
  assert.match(content, /setImageFile\(null\);/);
  assert.match(content, /create-agent-history-button/);
  assert.match(content, /className="create-agent-input-bar"/);
  assert.match(content, /className="create-agent-upload-trigger"/);
  assert.match(content, /className="create-agent-upload-preview"/);
  assert.match(content, /className="create-agent-upload-remove"/);
  assert.match(content, /className="create-agent-settings-head"/);
  assert.match(content, /className="create-agent-settings-scroll"/);
  assert.match(content, /className="create-agent-settings-footer"/);
  assert.match(content, /className="create-agent-settings-field is-system-prompt"/);
  assert.match(content, /className="create-agent-message-image"/);
  assert.match(content, /className="create-agent-history-image"/);
  assert.match(content, /<ImageLightbox/);
  assert.match(content, /className=\{`create-agent-message is-\$\{message\.role\}`}/);
  assert.match(content, /className="create-agent-pending-map-card"/);
  assert.match(content, /className="create-agent-history-list"/);
  assert.match(content, /const fallbackPromptText = trimmedInput \|\| \(imageFile \? activeAgent\.openingPrompt : ""\);/);
  assert.match(content, /text: fallbackPromptText,/);
  assert.match(content, /formData\.append\("userText", fallbackPromptText\);/);
  assert.doesNotMatch(content, /create-agent-file-chip/);
  assert.doesNotMatch(content, /已上传图片：/);
  assert.match(content, /window\.dispatchEvent\(new CustomEvent\(CREATE_FORM_MAPPING_EVENT,/);
  assert.match(content, /detail:\s*\{\s*agentType,\s*fields,\s*promptSuggestions\s*}/);
});

test("agent overlay styles keep the floating panel above the rest of the create page", () => {
  const content = read("app", "ui-ux-pro-max.css");

  assert.match(content, /\.create-agent-overlay-backdrop\s*\{[\s\S]*z-index:\s*180;/);
  assert.match(content, /\.create-agent-overlay-panel\s*\{[\s\S]*z-index:\s*190;/);
  assert.match(content, /\.create-agent-history-button/);
  assert.match(content, /\.create-agent-input-bar\s*\{/);
  assert.match(content, /\.create-agent-upload-trigger\s*\{/);
  assert.match(content, /\.create-agent-body\s*\{[\s\S]*min-height:\s*clamp\(/);
  assert.match(content, /\.create-agent-message-list,\s*\n\.create-agent-history-list\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(content, /\.create-agent-message-list\s*\{[\s\S]*align-content:\s*start;/);
  assert.match(content, /\.create-agent-upload-preview\s*\{/);
  assert.match(content, /\.create-agent-upload-remove\s*\{/);
  assert.match(content, /\.create-agent-settings-head\s*\{/);
  assert.match(content, /\.create-agent-settings-scroll\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(content, /\.create-agent-settings-footer\s*\{/);
  assert.match(content, /\.create-agent-settings-field\.is-system-prompt textarea\s*\{/);
  assert.match(content, /create-agent-message-image/);
  assert.match(content, /create-agent-history-image/);
  assert.match(content, /\.create-agent-message\.is-user\s*\{[\s\S]*justify-self:\s*end;/);
  assert.match(content, /\.create-agent-message\.is-agent\s*\{[\s\S]*justify-self:\s*start;/);
});

test("create form persists a draftId and broadcasts draft context for agent history isolation", () => {
  const content = read("components", "create-job-form.tsx");

  assert.match(content, /type CreateAgentMapDetail = \{/);
  assert.match(content, /const CREATE_AGENT_DRAFT_CONTEXT_EVENT = "create-agent:draft-context";/);
  assert.match(content, /const \[agentDraftId, setAgentDraftId\] = useState/);
  assert.match(content, /draftId:\s*agentDraftId,/);
  assert.match(content, /window\.dispatchEvent\(new CustomEvent\(CREATE_AGENT_DRAFT_CONTEXT_EVENT, \{ detail: \{ draftId: agentDraftId } }/);
  assert.match(content, /setAgentDraftId\(createCreateDraftId\(\)\);/);
  assert.match(content, /window\.addEventListener\(CREATE_FORM_MAPPING_EVENT, handleCreateAgentMap as EventListener\);/);
  assert.match(content, /window\.removeEventListener\(CREATE_FORM_MAPPING_EVENT, handleCreateAgentMap as EventListener\);/);
  assert.match(content, /productName:\s*(mappedFields|mapped\.fields\??)\.productName \?\? current\.productName,/);
  assert.match(content, /sellingPoints:\s*(mappedFields|mapped\.fields\??)\.sellingPoints \?\? current\.sellingPoints,/);
  assert.match(content, /materialInfo:\s*(mappedFields|mapped\.fields\??)\.materialInfo \?\? current\.materialInfo,/);
  assert.match(content, /sizeInfo:\s*(mappedFields|mapped\.fields\??)\.sizeInfo \?\? current\.sizeInfo,/);
  assert.match(content, /brandName:\s*(mappedFields|mapped\.fields\??)\.brandName \?\? current\.brandName,/);
  assert.match(content, /resolveMappedPromptInputs\(/);
  assert.match(content, /creationMode: "prompt",/);
  assert.match(content, /promptInputs: mappedPromptInputs \?\? current\.promptInputs,/);
  assert.match(content, /targetPromptCount: requestCount,/);
});

test("create form does not warn before leaving the studio", () => {
  const content = read("components", "create-job-form.tsx");

  assert.doesNotMatch(content, /window\.addEventListener\("beforeunload"/);
  assert.doesNotMatch(content, /window\.removeEventListener\("beforeunload"/);
  assert.doesNotMatch(content, /window\.confirm\(text\.leavePrompt\)/);
  assert.doesNotMatch(content, /event\.returnValue = text\.leavePrompt/);
});
