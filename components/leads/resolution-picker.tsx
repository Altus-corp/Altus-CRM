"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// A native <select> never fires a change event when the user re-picks the
// value it already shows, so re-selecting "Ringing" while it's already
// "Ringing" (needed for the 5x-Ringing auto-release) would silently do
// nothing. This is a button + menu instead, so every click always fires,
// even picking the same option twice in a row.
export function ResolutionPicker({ value, options, disabled = false, placeholder, onChoose, wide = false }: { value: string; options: { value: string; label: string }[]; disabled?: boolean; placeholder: string; onChoose: (value: string) => void; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentLabel = options.find((option) => option.value === value)?.label;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsideClick);
    return () => window.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  function toggle() {
    if (open) { setOpen(false); return; }
    const box = buttonRef.current?.getBoundingClientRect();
    if (box) setPosition({ left: box.left, top: box.bottom + 4, width: box.width });
    setOpen(true);
  }

  function choose(nextValue: string) {
    setOpen(false);
    onChoose(nextValue);
  }

  return <>
    <button ref={buttonRef} type="button" disabled={disabled || !options.length} onClick={toggle} className={`flex h-8 ${wide ? "min-w-[160px]" : "min-w-[145px]"} items-center justify-between gap-1.5 rounded border border-slate-200 bg-white px-2 text-left text-xs font-semibold text-slate-700 outline-none hover:border-red-300 focus:border-red-400 disabled:cursor-not-allowed disabled:bg-slate-50`}>
      <span className="truncate">{currentLabel ?? placeholder}</span>
      <span aria-hidden="true" className="shrink-0 text-[10px] text-slate-400">▾</span>
    </button>
    {open && typeof document !== "undefined" && createPortal(
      <div ref={menuRef} style={{ position: "fixed", left: position.left, top: position.top, minWidth: position.width, zIndex: 150 }} className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-2xl">
        {options.map((option) => <button key={option.value} type="button" onClick={() => choose(option.value)} className={`block w-full rounded px-2 py-1.5 text-left text-xs font-semibold hover:bg-red-50 ${option.value === value ? "bg-red-50 text-red-700" : "text-slate-700"}`}>{option.label}</button>)}
      </div>,
      document.body,
    )}
  </>;
}
