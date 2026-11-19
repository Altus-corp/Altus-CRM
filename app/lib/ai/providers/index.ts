import "server-only";
import type { ChatProvider } from "../types";
import { createGeminiProvider } from "./gemini";
import { createGroqProvider } from "./groq";

// Adding a second provider later (OpenAI, Claude, etc.): write a new file in
// this folder exporting a createXProvider() that returns a ChatProvider,
// then add one case below. Nothing in tools.ts, run-assistant.ts, the API
// route, or the UI needs to change.
export function getChatProvider(): ChatProvider {
  const provider = process.env.AI_PROVIDER?.trim().toLowerCase() || "gemini";
  switch (provider) {
    case "gemini":
      return createGeminiProvider();
    case "groq":
      return createGroqProvider();
    default:
      throw new Error(`Unknown AI_PROVIDER "${provider}".`);
  }
}
