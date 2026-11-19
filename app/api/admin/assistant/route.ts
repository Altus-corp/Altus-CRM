import { requireUser } from "@/app/lib/auth";
import { runAssistant } from "@/app/lib/ai/run-assistant";
import type { ConversationTurn } from "@/app/lib/ai/types";

export async function POST(request: Request) {
  try {
    const { roles } = await requireUser();
    if (!roles.includes("admin")) return Response.json({ ok: false, error: "This assistant is for admins." }, { status: 403 });

    const body = await request.json() as { message?: string; history?: ConversationTurn[] };
    const message = String(body.message ?? "").trim().slice(0, 2000);
    if (!message) return Response.json({ ok: false, error: "Type a question first." }, { status: 400 });
    const history = Array.isArray(body.history) ? body.history.slice(-20) : [];

    const { reply, history: updatedHistory } = await runAssistant(message, history);
    return Response.json({ ok: true, reply, history: updatedHistory });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "The assistant could not answer that." }, { status: 500 });
  }
}
