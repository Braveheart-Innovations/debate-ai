/**
 * Some models can't be forced to call a tool (verified 2026-10-06: Claude
 * Sonnet/Opus 5.5 'tool_choice: type "tool" and "any" are not supported for
 * this model'; Cohere Command A Reasoning "tool_choice is not supported for
 * this model"). When a forced request is rejected for that reason, the proxy
 * resends it once unforced with the same tools.
 */
export function isForcedToolChoice(toolChoice: unknown): boolean {
  return toolChoice === 'required' || (typeof toolChoice === 'object' && toolChoice !== null);
}

export function shouldRetryUnforced(status: number, errorText: string, toolChoice: unknown): boolean {
  return status === 400 && isForcedToolChoice(toolChoice) && /tool_choice/i.test(errorText);
}
