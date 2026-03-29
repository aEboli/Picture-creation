export function resolveMappedPromptInputs(input: {
  promptSuggestions: unknown;
  targetPromptCount: number | null | undefined;
}): string[] {
  const validPromptSuggestions = Array.isArray(input.promptSuggestions)
    ? input.promptSuggestions
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const fallbackCount = Math.max(validPromptSuggestions.length, 1);
  const normalizedTargetPromptCount =
    Number.isInteger(input.targetPromptCount) && (input.targetPromptCount ?? 0) > 0
      ? (input.targetPromptCount as number)
      : fallbackCount;

  return Array.from({ length: normalizedTargetPromptCount }, (_, index) => validPromptSuggestions[index] ?? "");
}
