/*
 * Shared helpers for reading a stage's single tool_use block. Every stage sends one tool and
 * parses its input through a schema, so the block shape and the find/validate dance live here.
 */

// Opus 5.5 rejects a forced tool_choice with HTTP 400, so stages offer their one tool under auto
// and treat a reply without the tool call as a failure (see toolUseMissingMessage).
export const SINGLE_TOOL_CHOICE = { type: "auto" } as const;

// Keeps the " tool use returned" wording that isSchemaParseError matches, and adds the stop
// reason so a text-only reply or a max_tokens cut is visible in the trace.
export function toolUseMissingMessage(toolName: string, message: { stop_reason?: string | null }) {
  return `No ${toolName} tool use returned (stop_reason: ${message.stop_reason ?? "unknown"})`;
}
export type ToolUseLike = {
  type: string;
  name?: string;
  input?: unknown;
  id?: string;
  text?: string;
};

export function parseToolUse<T>(
  message: { content: ToolUseLike[]; stop_reason?: string | null },
  toolName: string,
  schema: { parse: (input: unknown) => T },
  normalize: (input: unknown) => unknown
): T {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse) {
    throw new Error(toolUseMissingMessage(toolName, message));
  }
  if (toolUse.input === undefined) {
    throw new Error(`${toolName} tool use returned no input`);
  }
  return schema.parse(normalize(toolUse.input));
}
