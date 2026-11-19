import "server-only";
import { getChatProvider } from "./providers";
import { runTool, TOOL_DEFINITIONS } from "./tools";
import type { ConversationTurn } from "./types";

const SYSTEM_PROMPT = `You are an internal assistant for Altus CRM, used only by admins. You answer questions about leads, follow-ups, resolutions, and sales person performance by calling the provided tools — never make up numbers or lead details. If a tool returns an error or no data, say so plainly. Keep answers short and concrete: use numbers, names, and short lists rather than long prose. You cannot change any data; you can only look things up.`;

const MAX_TOOL_ROUNDS = 5;

export async function runAssistant(userMessage: string, priorHistory: ConversationTurn[] = []): Promise<{ reply: string; history: ConversationTurn[] }> {
  const provider = getChatProvider();
  const history: ConversationTurn[] = [...priorHistory, { role: "user", content: userMessage }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await provider.chat({ system: SYSTEM_PROMPT, tools: TOOL_DEFINITIONS, history });
    if (response.type === "text") {
      history.push({ role: "assistant", content: response.content });
      return { reply: response.content, history };
    }

    history.push({ role: "assistant", toolCalls: response.calls });
    for (const call of response.calls) {
      let result: unknown;
      try {
        result = await runTool(call.name, call.arguments);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : "Tool failed unexpectedly." };
      }
      history.push({ role: "tool", toolCallId: call.id, toolName: call.name, result });
    }
  }
  const fallback = "I needed too many lookups to answer that — try asking a more specific question.";
  history.push({ role: "assistant", content: fallback });
  return { reply: fallback, history };
}
