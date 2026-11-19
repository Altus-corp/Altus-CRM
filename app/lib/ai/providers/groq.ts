import "server-only";
import type { ChatProvider, ConversationTurn, ProviderResponse, ToolCall, ToolDefinition } from "../types";

// Groq's API is OpenAI-compatible: chat completions with "tools" in the
// OpenAI function-calling shape, and tool results fed back as role "tool"
// messages tagged with tool_call_id.
type GroqToolCall = { id: string; type?: "function"; function: { name: string; arguments: string } };
type GroqMessage = { role: "system" | "user" | "assistant" | "tool"; content?: string | null; tool_calls?: GroqToolCall[]; tool_call_id?: string; name?: string };
type GroqResponse = {
  choices?: { message?: { content?: string | null; tool_calls?: GroqToolCall[] } }[];
  error?: { message?: string };
};

function toGroqTool(definition: ToolDefinition) {
  return {
    type: "function" as const,
    function: {
      name: definition.name,
      description: definition.description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(Object.entries(definition.parameters.properties).map(([key, value]) => [key, { type: value.type, description: value.description, enum: value.enum }])),
        required: definition.parameters.required ?? [],
      },
    },
  };
}

function toGroqMessages(system: string, history: ConversationTurn[]): GroqMessage[] {
  const messages: GroqMessage[] = [{ role: "system", content: system }];
  for (const turn of history) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.content });
    else if (turn.role === "tool") messages.push({ role: "tool", tool_call_id: turn.toolCallId, name: turn.toolName, content: JSON.stringify(turn.result) });
    else if ("toolCalls" in turn) messages.push({ role: "assistant", content: null, tool_calls: turn.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });
    else messages.push({ role: "assistant", content: turn.content });
  }
  return messages;
}

export function createGroqProvider(): ChatProvider {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured.");

  return {
    async chat({ system, tools, history }): Promise<ProviderResponse> {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: toGroqMessages(system, history),
          tools: tools.length ? tools.map(toGroqTool) : undefined,
        }),
        cache: "no-store",
      });
      const result = await response.json() as GroqResponse;
      if (!response.ok) throw new Error(result.error?.message || "Groq request failed.");
      const message = result.choices?.[0]?.message;
      const toolCalls = message?.tool_calls ?? [];
      if (toolCalls.length) {
        const calls: ToolCall[] = toolCalls.map((call) => ({ id: call.id, name: call.function.name, arguments: JSON.parse(call.function.arguments || "{}") }));
        return { type: "tool_calls", calls };
      }
      return { type: "text", content: (message?.content ?? "").trim() || "I couldn't find an answer for that." };
    },
  };
}
