# Code-quality review — 2026-07-23

Workflow: 4 Sonnet 5 sweep lenses (organization, comments, readability,
performance) over all 17 in-scope files, completeness critic, dedup, and one
adversarial verifier per finding. 31 agents total. Coverage: complete.
Result: 25 confirmed, 0 refuted. Severities below are the VERIFIER-adjusted
values (several sweep claims were downgraded).

Totals: 3 high, 11 medium, 11 low.

## HIGH

### H1. [performance] src/main.ts:107 — Coin-asset and settings loads serially block the first page paint they don't need

The coin-asset retry ladder (lines 107-127, up to 3 attempts with 300ms/600ms backoff) and the subsequent sequential `await loadTally`, `loadBgEnabled`, `loadTallyEnabled`, `loadDiceMode`, `loadDiceStats`, `loadResetOnStartup` (lines 129-141) all complete before `bridge.createStartUpPageContainer` (line 218) is even called, and therefore before `home.open()` (line 866) can show anything. `homePage()` (lines 167-171) contains no coin container and none of these settings affect its content — the die assets already use a lazy pattern (`ensureDieAssets`, lines 152-156) for exactly this reason, but coin assets and the tally/settings reads don't get the same treatment.

**Suggestion:** Call `createStartUpPageContainer` (and start `sendBanner`'s banner load) as soon as `bridge` resolves, and defer coin-asset loading / kv reads to run in the background (or lazily like `ensureDieAssets`) so the home screen's first paint isn't gated on state it never displays.

### H2. [readability] src/main.ts:168 — containerTotalNum is a hand-maintained magic number, not derived from the arrays

homePage() (line 168, containerTotalNum: 3) and gamePage() (line 174, containerTotalNum: 5) each hardcode a total that must equal textObject.length + imageObject.length listed a few lines below, but nothing computes or asserts that invariant. A reviewer adding or removing a container from either array (a very plausible future change per the file's own comment at 160-163 about page layouts) has no signal that the count also needs to be bumped, and the SDK failure mode for a mismatch isn't documented here.

**Suggestion:** Compute containerTotalNum as textObject.length + imageObject.length in homePage()/gamePage() so the two can never drift, or at minimum add an inline comment stating the exact count-must-match-array-length invariant.

### H3. [organization] src/main.ts:254 — TextContainerUpgrade/ImageRawDataUpdate payload construction is duplicated with no shared helper

The exact same object shape — containerID, containerName, content, contentOffset: 0, contentLength: 0 wrapped in enqueue(() => bridge.textContainerUpgrade(...)) — is hand-built independently at main.ts:254-263 (sendDrizzleContent), 328-338 (updateTallyDisplay), 392-401 (sendStatus), and 593-601 (menuTakeover), and the equivalent ImageRawDataUpdate shape is rebuilt at main.ts:410-418 and 582-589, plus again inside flip.ts:66-74 and roll.ts:130-137. There is no single place that owns 'what a text/image container write looks like', so a future field addition (or a bug in one) has to be hunted down and fixed in seven-plus places.

**Suggestion:** Add thin sendText(id, name, content) / sendImage(id, name, bytes) wrappers (e.g. in bridgeQueue.ts) that build the SDK request object once, and have every call site above call through them.

## MEDIUM

### M1. [readability] index.html:246 — Mirror CSS geometry for status/tally rows lacks the layout-correspondence comment its neighbors have

The `.mirror-status`, `.mirror-heads`, and `.mirror-tails` rules (lines 246-271) hardcode percentages/cqb values (86cqb, 13.9cqb, 30%, 1cqb) that must track layout.ts's STATUS_Y/STATUS_H/TALLY_Y/TALLY_H, but unlike the `#mirror-banner` and `#mirror-home` rules a few lines below (282-298, each annotated 'Matches the glasses ... container: WxH at (x,y)'), no comment ties these numbers back to the TypeScript constants they mirror.

**Suggestion:** Add the same 'Matches the glasses X container: ...' comment style used for banner/home-menu to the status/heads/tails rules so the cross-file coupling is consistent and visible.

### M2. [comments] src/assets.ts:24 — Image-processing tuning constants lack rationale

`ALPHA_THRESHOLD = 180`, `CONTRAST_FACTOR = 1.6`, and `PALETTE_SIZE = 16` (lines 24-26) drive the entire glasses render pass in `renderProcessed` — they decide what counts as opaque, how hard the contrast boost pushes luminance, and how many palette levels the encoded PNG gets. None carry a comment on why these specific values were chosen (display legibility tuning, palette-size vs. BLE payload size tradeoff, etc.), so a reviewer can't tell if they're safe to retune or load-bearing constants tied to how the G2 firmware renders monochrome art.

**Suggestion:** Add a short why-comment near the constants, e.g. noting they were tuned against the G2 display (threshold/contrast for legibility on the monochrome panel, 16-level palette to keep image payload size down over BLE) so future tuning knows what tradeoff it's touching.

### M3. [readability] src/bridgeQueue.ts:44 — run() interleaves three concurrency mechanisms in one nested function

The `run` function (lines 44-103) combines a caller-liveness timeout, a manually-constructed Promise wrapping a hard-cap setTimeout, and a straggler-grace race, coordinated through three mutable flags (`settled`, `advanced`, module-level `straggler`) all in one body. Even with the header's excellent prose comments, tracing which flag gates which path requires holding all three mechanisms in mind simultaneously.

**Suggestion:** Split the hard-cap-and-straggler-handoff logic (lines 86-102) into a separate named helper (e.g. advanceChainWhenSettled) so each concurrency concern reads as its own unit.

### M4. [comments] src/cache.ts:5 — BASE64_CHUNK's crash-avoidance rationale is undocumented

`BASE64_CHUNK = 0x8000` gates the loop in `bytesToBase64` (lines 7-14) that walks the byte array in 32768-byte slices and calls `String.fromCharCode(...chunk)` per slice instead of once over the whole array. That chunking exists to avoid blowing the JS engine's max-arguments/call-stack limit when spreading a large typed array (a banner or coin image easily exceeds it) — nothing in the file says so, so it reads like an arbitrary micro-batch.

**Suggestion:** Add a one-line why-comment on BASE64_CHUNK, e.g. "Spreading the whole array into String.fromCharCode(...) can exceed the engine's call-stack/argument limit on larger images (banner, coin frames) — chunk to stay under it." so a future simplification pass doesn't collapse the loop back into a single call.

### M5. [readability] src/drizzle.ts:22 — Coin-band grid constants silently mirror layout.ts pixel geometry with no stated correspondence

CELL_W/COLS/ROWS and COIN_ROW_TOP/BOT/COIN_COL_LEFT/RIGHT (lines 22-29) are independent magic numbers that happen to track layout.ts's COIN_X/COIN_Y/COIN_W/COIN_H (e.g. COIN_ROW_TOP=2 at ~64px lines up with COIN_Y=72), but nothing computes or comments that relationship. A reviewer changing the coin's on-canvas position or size in layout.ts has no way to know these seven constants in a different file need matching updates.

**Suggestion:** Either derive the row/column bounds from the layout.ts coin constants directly, or add a comment stating the exact pixel correspondence (e.g. 'row 2-7 ≈ COIN_Y..COIN_Y+COIN_H at ROW_H=32px') so the coupling is visible on a cold read.

### M6. [organization] src/flip.ts:13 — flip.ts and roll.ts are near-duplicate controller modules

The two controllers duplicate their scaffolding almost line-for-line: STATUS_PAD/STATUS_INNER_W (flip.ts:13-14 vs roll.ts:13-14), STATUS_BLANK (flip.ts:22 vs roll.ts:20), the delay() helper (flip.ts:92-93 vs roll.ts:155-156), and the busy/resultShowing state plus the trigger()-catch-converge-to-idle recovery block (flip.ts:153-169 vs roll.ts:218-232) are copy-pasted with only the animation body swapped out. Any fix to the shared error-recovery or pacing logic (e.g. the FRAME_HOLD_MS pacing trick documented in both files) has to be applied twice by hand.

**Suggestion:** Factor the shared scaffolding (status constants, delay, busy/resultShowing bookkeeping, the trigger-catch-recover wrapper) into a small shared helper both controllers configure with their mode-specific frame sequence, instead of two independent copies.

### M7. [organization] src/main.ts:196 — main.ts has outgrown 'wiring layer' into a dumping ground for subsystem logic

Beyond wiring dependencies together, main.ts embeds full subsystems inline: page-rebuild retry/recovery logic with a revert-on-double-failure path (sendPageRebuild, lines 196-216), a ~90-line gesture-routing state machine covering double-tap debounce, pending-menu deferral, and per-surface dispatch (handleBridgeEvent, lines 772-861), and mode-switching business rules that guard against mid-animation races (setDiceMode, lines 441-462). Each is complex enough to be independently testable and reviewable, but currently a reviewer must read the entire 866-line file to find and reason about any one of them.

**Suggestion:** Extract page-container lifecycle (create/rebuild/retry) into its own module (e.g. pageContainer.ts) and the gesture-routing switch into an input.ts that main.ts merely wires bridge events into, leaving main.ts as the thin composition root the brief is asking whether it still is.

### M8. [readability] src/main.ts:280 — sendDrizzleFrame's content expression nests two ternaries around a fallback edge case

Lines 280-286 compute the frame content with `currentPhase === 'motion' && rollField ? makeRollFieldFrame(...) : makeDrizzleFrame(currentPhase === 'motion' ? 'landed' : currentPhase, drizzleSeed)` — the inner ternary only matters in the edge case where phase is 'motion' but rollField is somehow null, silently falling back to a 'landed' palette. That fallback path isn't called out, so a reviewer has to mentally simulate both ternaries to notice it exists.

**Suggestion:** Pull the phase-to-render decision into a small named function or add a one-line comment flagging that the inner ternary is a defensive fallback for motion-without-a-field, not a normal path.

### M9. [performance] src/main.ts:580 — Settings-menu open writes bgDrizzle twice, wasting a full BLE round trip

menuTakeover() (src/main.ts:574-604) issues a BLE write blanking the bgDrizzle text container (`void sendDrizzleContent(BG_BLANK)`, line 580). The settings `menu` controller is created without a `prepare` callback, so menu.open() (src/menu.ts:130-146) calls onOpen() then immediately calls render() synchronously in the same tick, and render() (src/menu.ts:99-123) issues a second BLE textContainerUpgrade to the exact same container (IDS.bgDrizzle) with the real menu rows. The blank content is never meaningfully displayed before being overwritten, so every double-tap into settings pays for two serialized 500ms+-class writes to one container when one would do.

**Suggestion:** Drop the bgDrizzle blank from menuTakeover() (its coin/status/tally blanks are still needed since nothing else overwrites those) and let the menu's own render() supply the first real content directly, since render() unconditionally repaints the whole container anyway.

### M10. [readability] src/main.ts:772 — handleBridgeEvent packs a whole undocumented gesture-classification protocol into one 90-line function

handleBridgeEvent (lines 772-861) derives every semantic gesture (single click, double click, swipe up/down) from raw SDK fields via `hasSys`, `sysType`, `textType`, most tellingly `const isSingleClick = hasSys && sysType === null` at line 794 — the fact that a present sysEvent with a null eventType specifically means 'single click' is an SDK-level convention that isn't stated anywhere near the code, so a reviewer must reverse-engineer it from usage. This is the single largest and most state-heavy function in the file the brief flags as needing the hardest scrutiny.

**Suggestion:** Extract the raw-event-to-gesture classification into a small named function (e.g. classifyGesture(event)) with a comment documenting the sysEvent/textEvent field conventions it relies on, so handleBridgeEvent itself only routes already-named gestures.

### M11. [comments] src/preview.ts:40 — Green-channel-only tint has no comment explaining the hardware mimicry

Inside `makePainter`'s `img.onload` (lines 40-45), the loop computes a luminance average and then zeroes the red and blue channels, writing luminance only into green (`px[i]=0; px[i+1]=lum; px[i+2]=0`). This isn't a generic grayscale conversion — it's reproducing the G2's green monochrome OLED look for the phone-side preview (matching the `#3CFA44` color used elsewhere in index.html's mirror CSS), but nothing in this function says so, so a reviewer sees an unexplained per-pixel channel zeroing that looks like a bug or leftover debug tint.

**Suggestion:** Add a comment such as "Recolor to the G2's green monochrome look so the phone preview matches the glasses' display" directly above the loop.

## LOW

### L1. [comments] src/cache.ts:4 — CACHE_VERSION lacks the bump-rationale comment its sibling in dice.ts has

`const CACHE_VERSION = 'v5'` has no explanation of when to bump it, unlike DICE_ASSET_VERSION in dice.ts ('Bump when the art in public/dice/ or the pose table changes, so stale processed copies in the kv cache are abandoned'). Since this version gates every coin/banner cache key (cacheKey in this same file), a future asset or processing-pipeline change could silently serve stale cached PNGs if nobody knows this constant exists to bump.

**Suggestion:** Add a comment mirroring dice.ts's: bump CACHE_VERSION whenever renderProcessed's output format or the source PNGs change, so old kv-cached bytes are abandoned instead of served stale.

### L2. [readability] src/drizzle.ts:40 — SPACE_W's fallback constant (4) isn't reconciled with the documented 5px space width

`const SPACE_W = getTextWidth(' ') || 4` falls back to 4 if getTextWidth returns falsy, but index.html's mirror-CSS comment (around line 229) states the G2 font's space advances exactly 5px. A reader who cross-references the two files sees two different 'space width' numbers with no note on why the fallback differs from the documented real value or when the fallback path is actually taken.

**Suggestion:** Either use 5 to match the documented real space width, or add a comment explaining why 4 was chosen for the zero/undefined fallback case specifically.

### L3. [performance] src/drizzle.ts:119 — Per-row 'allowed columns' array in makeDrizzleFrame is recomputed every call despite being constant

In makeDrizzleFrame (lines 94-137), the `allowed` array (lines 119-124) is rebuilt from scratch on every call for every one of the 8 rows, but it depends only on fixed geometry constants (COIN_ROW_TOP/BOT, COIN_COL_LEFT/RIGHT) — never on `seed` or `phase` — so there are really only two distinct arrays (coin-band vs. full-width) across the app's whole lifetime. This function runs on every 700ms drizzle tick plus every forced phase-transition repaint, so the identical rebuild happens continuously for as long as the app is open.

**Suggestion:** Precompute the two possible 'allowed' column arrays once at module load (or memoize on first use) and reuse them by row category instead of reconstructing them inside every makeDrizzleFrame call.

### L4. [organization] src/drizzle.ts:139 — drizzle.ts bundles two unrelated animation systems in one file

The file's own divider comment at lines 139-146 marks a hard boundary between the ambient coin-flip rain (makeDrizzleFrame/makeInitialDrizzleFrame, lines 52-137, driven by PHASE_STYLES/mulberry32 stippling) and the dice-roll debris field (makeRollField/makeRollFieldFrame, lines 175-257, driven by a wrapping particle-world model with spin/streak state). They share only the CELL_W/COLS/ROWS grid constants and layoutRow(); main.ts imports both halves together even though roll.ts only ever needs the roll-field half and flip.ts only ever needs the drizzle half.

**Suggestion:** Split into drizzle.ts (ambient rain) and rollField.ts (debris field), with the shared grid/layout constants factored into layout.ts or a small shared module, so each consumer imports only what it uses.

### L5. [performance] src/drizzle.ts:223 — makeRollFieldFrame rebuilds an array of empty Maps every call

Every invocation allocates a fresh `Map<number,string>[]` of length ROWS via Array.from before populating it from `state.particles`. This runs on every roll-animation tick (the tumble frames hold 110-210ms, well under the 700ms drizzle tick), so it's a real per-frame allocation in the hot render path the brief calls out — the same class of waste already flagged for makeDrizzleFrame's `allowed` array at drizzle.ts:119, but in a different function that the sweep didn't catch.

**Suggestion:** Reuse a module- or state-level scratch array of Maps across calls, clearing each Map at the top of the function instead of reallocating the whole structure.

### L6. [readability] src/flip.ts:104 — Coin-flip threshold is an unexplained magic number

`crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'heads' : 'tails'` (line 104) hardcodes 128 with no name or comment, in contrast to roll.ts's rollValue (lines 40-47), which computes and comments an equivalent unbiased threshold explicitly. A reviewer must recompute 256/2 mentally to confirm there's no bias.

**Suggestion:** Name the constant (e.g. const HEADS_THRESHOLD = 128) or add a short comment noting 256 is even so the split is exactly unbiased.

### L7. [comments] src/main.ts:79 — DRIZZLE_TICK_MS's 700ms value is unexplained

`DRIZZLE_TICK_MS = 700` sets the cadence of every periodic drizzle bridge write while idle — a value that directly trades visual smoothness against BLE traffic on a link the brief describes as costing 500ms+ per round trip. Unlike the other timing constants in this file and in bridgeQueue.ts/roll.ts (all of which explain their chosen value), this one has no comment on why 700ms specifically was picked.

**Suggestion:** Add a brief comment noting the constraint behind 700ms (e.g. slow enough to leave headroom for BLE round trips per brief's 0.5-2s image-frame cost, fast enough to still read as ambient motion) so a future tuning pass understands what it's balancing.

### L8. [readability] src/main.ts:108 — Coin-asset retry loop uses unnamed magic numbers for attempt count and backoff

The retry ladder at lines 107-127 hardcodes `attempt <= 3` and `300 * attempt` inline, whereas the rest of the codebase consistently names comparable tuning constants (DEFAULT_TIMEOUT_MS, HARD_SETTLE_CAP_MS in bridgeQueue.ts, FRAME_HOLD_MS in flip.ts). A reviewer has to infer '3 attempts, linear 300ms backoff' from the raw literals instead of a label.

**Suggestion:** Extract MAX_ASSET_RETRIES = 3 and RETRY_BACKOFF_MS = 300 as named constants near the top of the IIFE.

### L9. [organization] src/main.ts:407 — Inconsistent verb naming for bridge-write helper functions

Functions that build a payload and enqueue a bridge write are named with three different verbs for the same category of action: sendDrizzleContent (line 249), sendStatus (line 389), and sendBanner (line 623) use 'send', while repaintMainImage (line 407) uses 'repaint' and updateTallyDisplay (line 320) uses 'update' for functions that do the same enqueue(bridge.textContainerUpgrade/updateImageRawData) pattern. A reader scanning for 'how does this module talk to the bridge' can't grep a single consistent prefix.

**Suggestion:** Pick one verb convention (e.g. send*) for every function whose job is 'build payload, enqueue bridge call' and rename the outliers to match.

### L10. [organization] src/main.ts:619 — blankImage is declared ~40 lines after its first two uses

menuTakeover (line 581/587) and homeTakeover (line 616) both reference the module-level `blankImage`, but it isn't declared until line 619 — well below both functions that close over it. It only works because neither function runs until after the whole module has finished evaluating (menu.open()/home.open() fire later on user gestures or at the tail of the module), so there's no TDZ crash today, but a reviewer reading top-to-bottom hits an undefined-looking identifier twice before finding its source, and any future refactor that calls either function earlier (e.g. during setup) would throw.

**Suggestion:** Hoist `const blankImage = makeBlankImage(COIN_W)` up near the other early asset/const setup (e.g. next to `assets`), before menuTakeover/homeTakeover are defined.

### L11. [comments] src/menu.ts:13 — MENU_INNER_W's 420px value has no derivation

`MENU_INNER_W = 420` drives spreadText's right-alignment for every settings row, but nothing explains where 420 comes from — it doesn't match CANVAS_W - 2*PAD (568, used elsewhere for STATUS_INNER_W/TALLY_INNER_W) or any other documented constant, so a reader can't tell if it's tuned to the MENU_INDENT + cursor width or just eyeballed.

**Suggestion:** Add a one-line comment stating what 420 is derived from (e.g. canvas width minus indent/margin reserved for the cursor and edge padding) so a future edit to MENU_INDENT or CANVAS_W knows whether this needs to change too.

---

# Remediation outcome — same day

All 25 findings fixed. Gates: `npx tsc --noEmit` clean after every batch, clean
production build, and a simulator smoke test of the full flow (home screen,
coin flip to result, settings menu open/close, home navigation, dice mode, roll
to result) with zero console errors or unhandled rejections.

New modules: `send.ts` (single owner of TextContainerUpgrade /
ImageRawDataUpdate payloads, replacing 10+ hand-built copies),
`pageContainer.ts` (page defs, derived containerTotalNum, startup create +
reload recovery, page swap with retry), `input.ts` (gesture classification with
documented SDK event-shape conventions, double-tap debounce, pending-menu
deferral, routing), `surface.ts` (shared flip/roll status geometry, pacing
delay, busy/result lifecycle with the error-recovery path), `charGrid.ts` +
`rollField.ts` (drizzle.ts split: shared grid/layout vs ambient rain vs dice
debris field).

Behavior changes (intentional): startup now enqueues the page create first and
loads coin assets and the banner lazily/in the background with settings reads
parallelized, so first paint no longer waits on work the home screen doesn't
display; menuTakeover no longer blanks the drizzle container before the menu
render repaints it (one BLE round trip saved per settings open); SPACE_W's
never-normally-taken fallback aligned to the documented 5px space advance.
main.ts shrank from 866 to 676 lines and is now a composition root.
