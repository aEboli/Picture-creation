import { ensureQueueReady } from "@/lib/queue";

declare global {
  var commerceStudioRuntimeStarted: boolean | undefined;
}

export function ensureRuntimeReady() {
  if (globalThis.commerceStudioRuntimeStarted) {
    return;
  }

  globalThis.commerceStudioRuntimeStarted = true;
  ensureQueueReady();
}
