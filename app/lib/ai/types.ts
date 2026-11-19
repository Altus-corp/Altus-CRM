// Shared types so the assistant's agent loop and tool definitions don't
// depend on which LLM provider is wired in. Switching providers later (e.g.
// adding OpenAI or Claude) means writing one new file that implements
// ChatProvider and adding one line to the factory in providers/index.ts —
// nothing else (tools, the agent loop, the API route, the UI) changes.

export type ToolDefinition = {
  name: string;
  description: string;
  // A minimal JSON-Schema-like shape, kept provider-agnostic. Each provider
  // adapter translates this into whatever format it needs.
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
};

export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> };

// A generic, provider-agnostic conversation turn. Each provider adapter
// converts a list of these into whatever shape its own API expects
// (Gemini's user/model/function roles, OpenAI/Claude's tool_use blocks, etc).
export type ConversationTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; toolCalls: ToolCall[] }
  | { role: "tool"; toolCallId: string; toolName: string; result: unknown };

export type ProviderResponse =
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "text"; content: string };

export interface ChatProvider {
  chat(input: { system: string; tools: ToolDefinition[]; history: ConversationTurn[] }): Promise<ProviderResponse>;
}
