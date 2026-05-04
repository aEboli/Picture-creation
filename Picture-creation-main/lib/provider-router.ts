export type ProviderType = "gemini" | "openai";

export function resolveProviderType(raw?: string): ProviderType {
  return raw === "openai" ? "openai" : "gemini";
}
