export const NAVBAR_HIDE_DELAY_MS = 5000;
export function shouldOpenNavigationShortcut(event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; key: string; target?: EventTarget | null }) {
  const target = event.target as HTMLElement | null;
  const typing = Boolean(target?.closest?.("input, textarea, select, [contenteditable='true']"));
  return event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "n" && !typing;
}
export function restoreNavigationFocus(target: HTMLElement | null | undefined, fallback: HTMLElement) { if (target?.isConnected) target.focus(); else fallback.focus(); }
export function focusFirstNavigationLink(target: HTMLElement | null | undefined) { target?.focus(); }
export type TimerApi = { setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>; clearTimeout: (timer: ReturnType<typeof setTimeout>) => void };
export class NavbarAutoHideController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private hovered = false; private focusHeld = false; private menuHeld = false; private editingHeld = false;
  private readonly setOpen: (open: boolean) => void;
  private readonly timers: TimerApi;
  constructor(setOpen: (open: boolean) => void, timers: TimerApi = window) { this.setOpen = setOpen; this.timers = timers; }
  open() { this.clear(); this.setOpen(true); }
  enter() { this.hovered = true; this.open(); }
  leave() { this.hovered = false; this.schedule(); }
  setFocusHeld(value: boolean) { this.focusHeld = value; value ? this.open() : this.schedule(); }
  setMenuHeld(value: boolean) { this.menuHeld = value; value ? this.open() : this.schedule(); }
  setEditingHeld(value: boolean) { this.editingHeld = value; value ? this.open() : this.schedule(); }
  navigationSelected() { this.focusHeld = false; this.menuHeld = false; this.editingHeld = false; this.schedule(); }
  schedule() { this.clear(); if (this.hovered || this.focusHeld || this.menuHeld || this.editingHeld) return; this.timer = this.timers.setTimeout(() => { this.timer = null; if (!this.hovered && !this.focusHeld && !this.menuHeld && !this.editingHeld) this.setOpen(false); }, NAVBAR_HIDE_DELAY_MS); }
  clear() { if (this.timer) this.timers.clearTimeout(this.timer); this.timer = null; }
  dispose() { this.clear(); }
}
