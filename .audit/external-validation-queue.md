# External-validation queue — checks owed on real G2 hardware

These cannot be closed by simulator or software evidence. Each lists the
specific on-device test owed. None are "fixed" until checked here.

## F11 — Roll-field glyphs (no software fix by design)
The dice debris field uses `▕ ◤ ◥ ◢ ◣ ◆ ◇` (user-chosen art direction), which
are outside the known-safe LVGL set; the idle drizzle uses `·` and `°`.
**Test:** in dice mode on hardware, roll and confirm the spinning corners,
gems, and streaks all render (screen not sparse/blank between ■ □ ▣ shapes).
If glyphs drop: escalate to P2 and substitute safe-set characters.

## F1 — Double-click debounce (fix applied, hardware timing unverified)
Fix assumes the double-fire arrives ~110ms apart; debounce window is 250ms.
**Test:** on hardware, double-tap from a mode view — the settings menu must
open and STAY open; double-tap again — it must close and stay closed; from
home, double-tap must show the exit prompt exactly once. Also verify two
deliberate, separate double-taps ~300ms+ apart still both register.

## F2 — Startup create-fallback (fix applied, only reproducible on device)
**Test:** open the app, background it, force the Even app to reload the
WebView (or relaunch the widget without a clean teardown) so the second
createStartUpPageContainer returns 1 — the home screen must still render and
respond via the recovery rebuild.

## F8 — Bridge hard-cap straggler grace (fix applied, needs real BLE stall)
**Test:** induce a >12s BLE stall that recovers (walk out of range and back
mid-roll). The app should recover without the frozen-app state that indicates
a concurrent-call collision.

## F10 — Double-tap during animation now deferred (store-review behavior)
**Test:** double-tap mid-tumble on hardware; the settings menu should open on
its own when the animation settles. Confirms the submission requirement that
the double-tap exit path is reachable from every state.

## F14 — iOS localStorage eviction resurrecting stale tally (accepted design tradeoff)
kvSet now retries + logs rejected SDK writes, but an ACKed-then-dropped SDK
write is undetectable in software.
**Test (long-horizon, iOS):** reset the tally, leave the app unused past the
WKWebView eviction horizon (~7 days), relaunch — check whether the tally
resurrects. If it does, the dual-store design needs a versioned value format.

## F16 — Keep-alive on AudioContext-less WebViews
**Test:** confirm on hardware (and any WebView where AudioContext is blocked)
that repeated taps no longer accumulate pending Web Lock requests
(`navigator.locks.query()` should show one held lock, no growing queue).

## F17 — Runtime rebuild rejection recovery
**Test:** if a page swap's rebuildPageContainer is ever rejected on hardware,
verify the retry/revert path leaves the app navigable rather than wedged.
