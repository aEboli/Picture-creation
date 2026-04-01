export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { ensureRuntimeReady } = await import("@/lib/runtime");
  ensureRuntimeReady();
}
