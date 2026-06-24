/*
 * Shared helpers for reading a forced Anthropic tool_use block. Extraction and
 * synthesis both force a single tool call and parse its input through a schema,
 * so the block shape and the find/validate dance live here once.
 */
export type ToolUseLike = {
  type: string;
  name?: string;
  input?: unknown;
  id?: string;
  text?: string;
};

export function parseToolUse<T>(
  message: { content: ToolUseLike[] },
  toolName: string,
  schema: { parse: (input: unknown) => T },
  normalize: (input: unknown) => unknown
): T {
  const toolUse = message.content.find((block) => block.type === "tool_use" && block.name === toolName);
  if (!toolUse) {
    throw new Error(`No ${toolName} tool use returned`);
  }
  if (toolUse.input === undefined) {
    throw new Error(`${toolName} tool use returned no input`);
  }
  return schema.parse(normalize(toolUse.input));
}
