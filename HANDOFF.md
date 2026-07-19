# Gig Worker Simulator — Handoff

_Last updated: 2026-07-13_

This document is a cold-start handoff for another LLM or developer taking over the project. It covers what the game is, current status, architecture, what's left, and how to test it.

---

## 1. What this is

A **mobile-first browser life-sim / strategy game**. The player is a gig worker piecing together income from short-term local jobs: browse a Craigslist-style listing board, accept gigs, resolve branching choice-tree scenarios and quick-time events (QTEs), and manage four meters (cash / stress / reputation / energy) while surviving weekly bills.

- Pure client-side: **Vite + vanilla JS + HTML5 Canvas**. No backend, no framework.
- State persists in **localStorage**.
- Audio is **procedural Web Audio** (no audio files).
- Art is **pre-generated FLUX pixel sprites** + procedural canvas drawing for UI/character.

Source of truth for the design: `PRD.md` and `ONE-SHOT-PROMPT.md` in the repo root.

---

## 2. Current status (as of 2026-07-13)

**Playable and UI-polished. Fully verified end-to-end. No console errors.**

Done:
- ✅ Complete Vite scaffold (`index.html`, `package.json`, `vite.config.js`).
- ✅ Full game loop: `MORNING → BROWSE → TRAVEL → GIG → RESULTS → EVENING`, plus `GAMEOVER` and new-game reset.
- ✅ 12 gig templates, 6 procedurally generated per day, reputation-gated gig types.
- ✅ 12 choice trees with branching outcomes, chance rolls, item requirements.
- ✅ 3 QTE minigames (rhythm tap, timed sequence, steady hand) with difficulty scaling on stress/energy.
- ✅ Character customization (skin/hair/shirt) persisted to localStorage.
- ✅ Bills system (rent/phone/food), overdue tracking, eviction game-over at 14 days.
- ✅ Upgrade shop (7 upgrades) with persisted effects.
- ✅ UI polish pass: rounded gradient buttons w/ hover, gradient HUD meters, styled gig cards with color-coded risk badges, dark background overlays, shadowed/outlined text.

**Not done yet** — see §5.

---

## 3. Run & repo

- **Location:** `C:\Users\Jbthi\gig-worker` (Windows). This is a standalone folder, **not yet a git repo**.
- **Install:** `npm install`
- **Dev:** `npm run dev` → http://localhost:5173
- **Build:** `npm run build` → static output in `dist/` (this is what gets deployed).

Node/Vite 5. No other dependencies.

---

## 4. Architecture / file map

```
gig-worker/
├── index.html                # mounts <div id="game">, loads /src/main.js
├── package.json, vite.config.js
├── PRD.md, ONE-SHOT-PROMPT.md # design docs
├── HANDOFF.md                # this file
└── src/
    ├── main.js               # bootstrap: canvas → input → state → rAF loop; asset loader + drawSprite()
    ├── engine/
    │   ├── canvas.js         # setupGameCanvas() High-DPI adapter
    │   ├── input.js          # InputManager: click + touch (+ desktop mousemove hover)
    │   ├── audio.js          # procedural Web Audio (BGM + SFX)
    │   └── state.js          # GameState class + localStorage save/load/reset/clamp
    ├── game/
    │   ├── loop.js           # Game class: state machine, transitions, UPGRADES, bills logic
    │   ├── gigs.js           # GIG_TEMPLATES, generateDailyGigs(), energy/travel cost helpers
    │   ├── choices.js        # CHOICE_TREES data + resolveChoice() engine
    │   └── qte.js            # RhythmTap / TimedSequence / SteadyHand + createQTE()
    └── ui/
        ├── screens.js        # screen renderers + immediate-mode UI (UI.register/handleClick, button(), panel(), drawBackground())
        ├── hud.js            # top bar: meters + day/bills counter
        ├── character.js      # drawCharacter() + renderCustomizer() + color palettes
        ├── listings.js       # gig board + gig card renderer
        └── text.js           # drawText (shadow/outline), drawWrapped, roundRectPath, drawMeter
```

### Key concepts another editor must know

- **Immediate-mode UI.** Each frame, `Game.render()` calls `UI.begin()`, screens draw and register clickable hotspots via `UI.register(x,y,w,h,cb)`, then `processInput()` consumes queued clicks and dispatches to the last-registered matching hotspot. There is no retained widget tree. Buttons are drawn by the shared `button()` in `screens.js`; to restyle all buttons, edit that one function.
- **Coordinate space is logical 800×600.** `InputManager.toLogical()` maps client pixels back to 800×600 regardless of CSS scaling/DPR, so all hit-testing is in 800×600.
- **Asset manifest quirk.** `src/assets/manifest.js` `import`s `drawCharacter` from `ui/character.js` and exports `ASSET_MANIFEST` (both were added/fixed during the build — the original file had neither). The icon sheets (`ui-icons.png`, `items.png`) are actually **1024×1024 grids**, not the 128×32 strips the PRD claims; `drawSprite()` in `main.js` auto-detects strip vs. square-grid layout and slices frames accordingly.
- **The on-screen character is procedurally drawn** (`drawCharacter`), not the `character.png` sprite, because a static PNG can't be recolored for customization. The PNG still loads via the manifest if wanted later.
- **Choice resolution semantics** (`resolveChoice` in `choices.js`): if a choice has `bonus`, the base result always applies and `chance` gates only the bonus; otherwise `chance` gates the whole result with `failResult` on a miss.

---

## 5. What's left (next run)

1. **In-game tutorials / onboarding.** No tutorial exists yet. Likely a first-run overlay or step-through explaining the four meters, browsing/accepting gigs, choice trees, QTEs, and bills. Gate on a `state.tutorialSeen` flag persisted to localStorage.
2. **Deploy to GitHub.**
   - Repo is **not initialized** — run `git init`, add a `.gitignore` (`node_modules/`, `dist/`), commit, create the remote, push.
   - **A GitHub token/auth is still pending** (see the MCP setup notes); the GitHub connector can't push without it. Have that ready first.
3. **Deploy to Lovable static hosting.**
   - It's a static Vite build: `npm run build` → serve `dist/`.
   - Confirm asset paths resolve under the host. Assets currently load from `/src/assets/media/...` at dev time; verify the built `dist/` references resolve on the static host, and set Vite `base` if deployed under a sub-path.

Suggested order: tutorials → git init & GitHub push → Lovable deploy from the pushed repo.

---

## 6. Testing

### What's been verified
Driven end-to-end with real clicks and pixel/state assertions:
- Full loop: apartment → check listings → select + accept gig → travel → choice tree → QTE → results → back to browse → evening → bills modal (pay all) → sleep → next day with recovered energy and fresh gigs.
- Game over at 14 days overdue rent; new-game reset restores defaults.
- Shop purchase, character customization persistence, disabled gig states (too tired / no time), disabled choice when a required item is missing.
- Full-resolution visual check of morning, listings, and gig screens — all render cleanly, no console errors.

### How to test in this environment (important gotcha)
The in-app browser pane **throttles `requestAnimationFrame` heavily**, so the game's own render loop may not tick while automating. Two techniques that work:

1. **Manually pump the loop.** A single `game.render(ctx)` both registers hotspots for the current phase and consumes queued clicks. So dispatch a synthetic click, then call render:
   ```js
   const g = window.__game;          // exposed on window for debugging
   const ctx = document.querySelector('canvas').getContext('2d');
   // click at logical (x,y):
   const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
   c.dispatchEvent(new MouseEvent('click', {
     clientX: r.left + x/800*r.width, clientY: r.top + y/600*r.height, bubbles: true }));
   g.update(0.016); g.render(ctx);   // pump one frame to process the click
   ```
   Fast-forward timed phases by setting fields directly (e.g. `g.travelT = 2` to skip travel; call `g.finishGig({success:true,score:80})` to end a QTE).

2. **Screenshots via `toDataURL`.** The screenshot tool times out (throttled compositor). Instead render manually, then `canvas.toDataURL('image/jpeg', 0.85)` and decode the base64 to a file to view. Full 800×600 JPEGs are ~70–90 KB; downscaled/low-quality thumbnails crush the dark panels to near-black and are misleading — capture at full res to judge.

### Suggested regression checks after any change
- `npm run dev`, open the app, confirm **no console errors**.
- Walk one full day: accept a gig with a QTE (e.g. Dog Walking / Moving Furniture) and one without, confirm payouts and stat deltas apply and results screen shows.
- Trigger bills (`g.state.daysUntilBills = 0; g.goEvening()`), pay/skip, sleep, confirm day advances and overdue tracking behaves.
- Resize to mobile viewport; confirm touch input and 44px+ tap targets still work.

---

## 7. Known deviations from the original spec
- Icon sheets are 1024×1024 grids (not 128×32 strips); handled by `drawSprite` auto-detection.
- `manifest.js` required a 2-line fix (import `drawCharacter`, add `export`) to work as a module.
- On-screen character is procedural (for recoloring), not the PNG.
- The UI-polish pass upgraded the existing `button()` / `renderHUD()` / gig-card renderers in place rather than adding the separate `drawButton`/`drawGigCard`/`drawHUD` functions some notes suggested — same visual result, single source of truth per component. The generic helpers (`drawText`, `drawMeter`, `roundRectPath`) live in `src/ui/text.js`.
