"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

const LANGUAGES = [
  { code: "en-IN", label: "English" },
  { code: "hi-IN", label: "Hindi" },
  { code: "mr-IN", label: "Marathi" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "bn-IN", label: "Bengali" },
];
const STORAGE_KEY = "crm_voice_dictation_lang";

type SpeechRecognitionResultLike = { 0?: { transcript?: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

// Browser speech recognition can't truly auto-detect which of these
// languages is being spoken — it needs one selected up front. The choice is
// remembered per browser so most users only ever pick it once.
export function VoiceDictationButton({ onResult, className = "", showLanguagePicker = true }: { onResult: (text: string) => void; className?: string; showLanguagePicker?: boolean }) {
  const [supported] = useState(() => Boolean(getSpeechRecognitionCtor()));
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState(() => {
    if (typeof window === "undefined") return "en-IN";
    try { return window.localStorage.getItem(STORAGE_KEY) || "en-IN"; } catch { return "en-IN"; }
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => () => { recognitionRef.current?.stop(); }, []);

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (text) onResult(text);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function changeLang(next: string) {
    setLang(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }

  if (!supported) return null;

  return <span className={`inline-flex items-center gap-1 ${className}`}>
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Stop dictation" : `Dictate (${LANGUAGES.find((option) => option.code === lang)?.label ?? lang})`}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${listening ? "animate-pulse border-red-400 bg-red-50 text-red-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
    >
      {listening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
    </button>
    {showLanguagePicker && <select
      value={lang}
      onChange={(event) => changeLang(event.target.value)}
      aria-label="Dictation language"
      title="Dictation language"
      className="h-6 shrink-0 rounded border border-slate-200 bg-white px-1 text-[10px] font-bold text-slate-600 outline-none"
    >
      {LANGUAGES.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
    </select>}
  </span>;
}
