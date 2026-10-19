const test = require("node:test");
const assert = require("node:assert/strict");
test("auto-hide opens on hover, waits two seconds after leave, and cancels on re-entry", async () => {
  const { NavbarAutoHideController, NAV_HIDE_DELAY_MS } = await import("../src/shared/layout/navbar-auto-hide.ts");
  let now = 0, next = 0; const timers = new Map(); const states = [];
  const clock = { setTimeout(callback, delay) { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; }, clearTimeout(id) { timers.delete(id); } };
  const advance = (ms) => { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } };
  const controller = new NavbarAutoHideController((open) => states.push(open), clock);
  controller.enter(); assert.equal(states.at(-1), true); controller.leave(); advance(NAV_HIDE_DELAY_MS - 1); assert.equal(states.at(-1), true);
  controller.enter(); advance(NAV_HIDE_DELAY_MS); assert.equal(states.at(-1), true);
  controller.leave(); advance(NAV_HIDE_DELAY_MS); assert.equal(states.at(-1), false); controller.dispose();
});
test("focus hold prevents close and releases on blur", async () => { const { NavbarAutoHideController, NAV_HIDE_DELAY_MS } = await import("../src/shared/layout/navbar-auto-hide.ts"); let callback; const states = []; const clock = { setTimeout(fn) { callback = fn; return 1; }, clearTimeout() { callback = null; } }; const controller = new NavbarAutoHideController((open) => states.push(open), clock); controller.enter(); controller.leave(); controller.setFocusHeld(true); callback?.(); assert.equal(states.at(-1), true); controller.setFocusHeld(false); callback?.(); assert.equal(states.at(-1), false); assert.equal(NAV_HIDE_DELAY_MS, 2000); });
test("Alt+N opens navigation only outside typing controls", async () => {
  const { shouldOpenNavigationShortcut } = await import("../src/shared/layout/navbar-auto-hide.ts");
  const navigationTarget = { closest: () => null };
  const typingTarget = { closest: () => ({}) };
  assert.equal(shouldOpenNavigationShortcut({ altKey: true, ctrlKey: false, metaKey: false, key: "n", target: navigationTarget }), true);
  assert.equal(shouldOpenNavigationShortcut({ altKey: true, ctrlKey: true, metaKey: false, key: "n", target: navigationTarget }), false);
  assert.equal(shouldOpenNavigationShortcut({ altKey: true, ctrlKey: false, metaKey: true, key: "n", target: navigationTarget }), false);
  assert.equal(shouldOpenNavigationShortcut({ altKey: true, ctrlKey: false, metaKey: false, key: "n", target: typingTarget }), false);
});
test("keyboard navigation focuses its first link and Escape can restore prior focus", async () => {
  const { focusFirstNavigationLink, restoreNavigationFocus } = await import("../src/shared/layout/navbar-auto-hide.ts");
  let firstLinkFocused = 0, previousFocused = 0, fallbackFocused = 0;
  focusFirstNavigationLink({ focus() { firstLinkFocused += 1; } });
  restoreNavigationFocus({ isConnected: true, focus() { previousFocused += 1; } }, { focus() { fallbackFocused += 1; } });
  restoreNavigationFocus({ isConnected: false, focus() { previousFocused += 1; } }, { focus() { fallbackFocused += 1; } });
  assert.equal(firstLinkFocused, 1);
  assert.equal(previousFocused, 1);
  assert.equal(fallbackFocused, 1);
});
