import "server-only";
import type { ChatProvider, ConversationTurn, ProviderResponse, ToolCall, ToolDefinition } from "../types";

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };
type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };
type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message?: string };
};

function toGeminiSchema(definition: ToolDefinition) {
  return {
    name: definition.name,
    description: definition.description,
    parameters: {
      type: "OBJECT",
      properties: Object.fromEntries(Object.entries(definition.parameters.properties).map(([key, value]) => [key, { type: value.type.toUpperCase(), description: value.description, enum: value.enum }])),
      required: definition.parameters.required ?? [],
    },
  };
}

// Gemini call-ids aren't a thing it returns to us, so this provider
// generates one locally per call just to satisfy the generic ToolCall shape
// the agent loop expects; it isn't sent back to Gemini.
let callCounter = 0;

function toGeminiHistory(history: ConversationTurn[]): GeminiContent[] {
  return history.map((turn): GeminiContent => {
    if (turn.role === "user") return { role: "user", parts: [{ text: turn.content }] };
    if (turn.role === "tool") return { role: "user", parts: [{ functionResponse: { name: turn.toolName, response: { result: turn.result } } }] };
    if ("toolCalls" in turn) return { role: "model", parts: turn.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.arguments } })) };
    return { role: "model", parts: [{ text: turn.content }] };
  });
}

function isOverloadedError(message: string) {
  return /high demand|overloaded|try again later/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createGeminiProvider(): ChatProvider {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  return {
    async chat({ system, tools, history }): Promise<ProviderResponse> {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: toGeminiHistory(history),
        tools: tools.length ? [{ functionDeclarations: tools.map(toGeminiSchema) }] : undefined,
      };
      // Busy/free-tier models occasionally return a transient "high demand"
      // error; a couple of short, automatic retries smooth that over
      // instead of making the admin resend the question themselves.
      const maxAttempts = 3;
      let result: GeminiResponse | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        result = await response.json() as GeminiResponse;
        if (response.ok) break;
        const message = result.error?.message || "Gemini request failed.";
        if (attempt === maxAttempts || !isOverloadedError(message)) throw new Error(message);
        await sleep(attempt * 1500);
      }
      const parts = result?.candidates?.[0]?.content?.parts ?? [];
      const calls: ToolCall[] = parts
        .filter((part): part is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in part)
        .map((part) => ({ id: `call_${callCounter++}`, name: part.functionCall.name, arguments: part.functionCall.args ?? {} }));
      if (calls.length) return { type: "tool_calls", calls };
      const text = parts.filter((part): part is { text: string } => "text" in part).map((part) => part.text).join("\n").trim();
      return { type: "text", content: text || "I couldn't find an answer for that." };
    },
  };
}
