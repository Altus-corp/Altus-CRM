"use client";

import { useRef, useState, type FormEvent } from "react";
import { Bot, Send, X } from "lucide-react";

type ConversationTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "assistant"; toolCalls: unknown[] }
  | { role: "tool"; toolCallId: string; toolName: string; result: unknown };

const SUGGESTIONS = ["Which leads are overdue for follow-up?", "Who has the most Ringing leads?", "Sales person leaderboard this week"];

export function CrmAssistant() {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayTurns = history.filter((turn): turn is { role: "user"; content: string } | { role: "assistant"; content: string } => "content" in turn);

  async function send(message: string) {
    if (!message.trim() || pending) return;
    setPending(true);
    setError("");
    const optimistic: ConversationTurn[] = [...history, { role: "user", content: message }];
    setHistory(optimistic);
    setInput("");
    try {
      const response = await fetch("/api/admin/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const result = await response.json() as { ok?: boolean; reply?: string; history?: ConversationTurn[]; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "The assistant could not answer that.");
      setHistory(result.history ?? optimistic);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "The assistant could not answer that.");
    } finally {
      setPending(false);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(input);
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label="Open CRM assistant" title="Ask the CRM" className="fixed bottom-5 right-5 z-[90] grid h-12 w-12 place-items-center rounded-full bg-[#d90000] text-white shadow-lg hover:bg-red-700">
      <Bot className="h-5 w-5" />
    </button>
    {open && <div className="fixed bottom-5 right-5 z-[95] flex h-[520px] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-red-50 px-4 py-3">
        <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-red-600" /><div><p className="text-sm font-extrabold text-slate-900">Ask the CRM</p><p className="text-[10px] font-semibold text-slate-500">Read-only — admin only</p></div></div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button>
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {!displayTurns.length && <div className="space-y-2">
          <p className="text-xs text-slate-500">Ask about leads, follow-ups, resolutions, or sales person performance.</p>
          {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">{suggestion}</button>)}
        </div>}
        {displayTurns.map((turn, index) => <div key={index} className={`max-w-[85%] rounded-xl px-3 py-2 text-xs font-medium leading-relaxed ${turn.role === "user" ? "ml-auto bg-red-600 text-white" : "bg-slate-100 text-slate-800"}`}>{turn.content}</div>)}
        {pending && <div className="max-w-[85%] rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">Thinking…</div>}
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-100 p-3">
        <input value={input} onChange={(event) => setInput(event.target.value)} disabled={pending} placeholder="Ask a question..." className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-red-400 disabled:bg-slate-50" />
        <button type="submit" disabled={pending || !input.trim()} aria-label="Send" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#d90000] text-white disabled:opacity-50"><Send className="h-4 w-4" /></button>
      </form>
    </div>}
  </>;
}
