# Gig Worker Simulator — Full Handoff: Game, Gameplay, and Audio/Visual Upgrade Plan

**Written:** 2026-08-13
**For:** any LLM/developer picking this up cold — this doc assumes no prior context. It stands
on its own; you don't need to have seen this repo's own `HANDOFF.md` first (though it exists
and is the deeper technical reference if you want more implementation detail).

**Live, public, no login required:** **https://gigworkerbaisinc.vercel.app**

**⚠️ Confirmed broken on that live URL right now (verified 2026-08-13, see §4 Group A) — every
background/sprite image 404s in production.** The game is still playable (it falls back
gracefully), but it currently looks like a black-and-text game on the actual public link, not
the illustrated game it is in local dev. Read §4 Group A before doing anything else here — this
is the highest-priority item in this whole document, not a nice-to-have.

**Source:** `C:\Users\Jbthi\gig-worker`
**Stack:** Vite + vanilla JavaScript + HTML5 Canvas — **no framework, not Phaser.** Custom
immediate-mode UI, custom render loop. Keep this in mind throughout: none of the Phaser-specific
patterns from the other two Bennett AI Solutions games (Semester Zero, Leaves of Deceit) port
directly here.

---

## 1. What this game is

**Gig Worker Simulator** is a mobile-first browser life-sim / survival-strategy game. You play
someone piecing together income from short-term local gig work — think a Craigslist-style
listings board come to life. Each in-game day you browse available gigs, accept the ones that
fit your energy/skills/risk tolerance, travel to them, resolve a branching choice-tree scenario
(sometimes with a quick-time-event minigame), get paid, and manage four meters — **cash,
stress, reputation, energy** — while bills (rent, phone, food) keep coming whether you worked or
not. Miss enough rent and you're evicted; that's the game-over condition.

**Tone:** wry, a little absurd, grounded in real gig-economy anxiety but not grim about it — the
gig pool ranges from mundane (yard work, dog walking, IKEA assembly) to openly weird (Water
Slide Tester, Professional Cuddler, Mattress Tester — Hotel Review), and the weirdness is part
of the joke, not a tonal accident.

---

## 2. How it plays, start to finish

**The state machine (see `game/loop.js`):**
`MORNING → BROWSE → TRAVEL → GIG → RESULTS → EVENING → (sleep) → next MORNING`, with a
`GAMEOVER` state reachable via eviction, and a new-game reset from there.

1. **Morning.** You wake up in your apartment. Character customization (skin/hair/shirt) is
   available and persists. You see your four meters and the day count.

2. **Browse listings.** A generated board of gigs for the day — `generateDailyGigs()` in
   `game/gigs.js` picks from **12 gig templates** across 4 categories (`physical`, `service`,
   `creative`, `weird`), gated partly by your reputation (creative gigs need reputation ≥2 or a
   laptop; weird gigs need reputation ≥3) and reshaped by the day's weather (rainy days pull all
   outdoor work off the board — the pool visibly shrinks/changes). Each listing shows a payout
   range, time cost, risk level, and location safety tier (safe/okay/sketchy), with some
   randomized variance and flavor text per instantiation so the same template doesn't feel
   identical twice.

3. **Accept a gig → travel → resolve.** Accepting costs time/energy to reach. Once there, you
   work through a **choice tree** specific to that gig (12 trees total, `game/choices.js`) —
   branching decisions with chance rolls and sometimes item requirements (e.g. a tool belt
   improves physical-gig payout). Some gigs additionally trigger a **QTE minigame**
   (`game/qte.js`): rhythm-tap, timed-sequence, or steady-hand, with difficulty scaling based on
   your current stress/energy — the worse your state, the harder the minigame, which is the
   game's way of making burnout mechanically real, not just a number going down.

4. **Results.** Payout, stat deltas (cash up, stress/energy shifted, reputation possibly up),
   shown before returning to browse-or-go-home.

5. **Evening → bills.** Rent, phone, and food bills accrue on a schedule; overdue bills stack;
   14 days overdue on rent triggers eviction (game over). You can sleep to advance the day
   (recovers energy) or push through if you've got more gigs left in you.

6. **Progression:** an upgrade shop (7 upgrades, e.g. a tool belt for physical-gig payout, a
   laptop to unlock creative gigs) with persisted effects, and reputation gates that open more
   (and weirder) gig types as you build a track record.

**Numbers that drive everything:** `cash` (survival), `stress` (rises with risky/QTE-heavy gigs,
raises future QTE difficulty — a compounding-pressure loop deliberately similar in spirit to
Leaves of Deceit's confidence spiral, just for a different genre), `reputation` (gates gig
variety), `energy` (caps how much you can do per day, restored by sleep). Full formulas live in
`game/gigs.js` (payout/risk instantiation) and `game/choices.js` (`resolveChoice()` — if a
choice has a `bonus`, the base result always applies and `chance` only gates the bonus;
otherwise `chance` gates the whole result with a `failResult` on a miss).

---

## 3. Current state of audio and visuals — read this before proposing anything

**Audio (`src/engine/audio.js`) — entirely procedural, no audio files.** Each SFX is 1–3 short
oscillator tones (`playClick`, `playCashIn`, `playCashOut`, `playStress`, `playSuccess`,
`playFail`, `playTick`, `playError`, `playAccept`, `playSting` — all actually wired into
gameplay). `startBGM()` loops a 4-chord triangle-wave progression every 2 seconds via
`setInterval`. Two exports are dead code, worth knowing about but not urgent: `playGood` (never
called) and `stopBGM` (never called — BGM just runs forever once started, presumably
intentional for a continuous apartment-sim loop, but worth confirming that's the intent before
assuming it's fine).

**Visuals (`src/assets/manifest.js`) — already real generated art, not procedural placeholders.**
`manifest.js` tags itself `tier: 'intermediate' (FLUX-generated sprites)`: `apartment.png`,
`character.png`, `items.png`, `listings-board.png`, `work-location.png`, `ui-icons.png` all
exist as real image files in `src/assets/media/`. **Except that on the live production URL,
none of them actually load** — see §4 Group A. The on-screen character itself is drawn
procedurally (`drawCharacter()` in `ui/character.js`, with skin/hair/shirt color params) rather
than from `character.png`, specifically so it can be recolored for the customization feature —
that part is fine and intentional, it's the *background* images that are the problem.

**Assets load via plain `new Image()`** against paths in `ASSET_MANIFEST.files` (see
`src/main.js:13`) — there's no framework asset pipeline like Phaser's here, just the browser's
native image loading.

---

## 4. Areas for improvement — grouped

### Group A: 🔴 CRITICAL — every image asset is 404ing on the live production site right now

**This was discovered and verified during this write-up, not inherited from an old note.**
Navigating to `https://gigworkerbaisinc.vercel.app` and checking the browser console shows six
straight 404s:

```
GET https://gigworkerbaisinc.vercel.app/src/assets/media/work-location.png  → 404
GET https://gigworkerbaisinc.vercel.app/src/assets/media/listings-board.png → 404
GET https://gigworkerbaisinc.vercel.app/src/assets/media/apartment.png      → 404
GET https://gigworkerbaisinc.vercel.app/src/assets/media/items.png          → 404
GET https://gigworkerbaisinc.vercel.app/src/assets/media/ui-icons.png       → 404
GET https://gigworkerbaisinc.vercel.app/src/assets/media/character.png      → 404
```

A screenshot of the live site confirms the visible impact: the apartment scene, listings board,
and work-location backgrounds are all just plain black. The game is still playable — buttons
work, the procedurally-drawn character renders fine (since it's drawn with Canvas, not loaded
from a file), text and meters all show correctly — but every piece of actual illustrated art is
silently missing on the URL Jameson would actually share with anyone.

**This is exactly the same class of bug that shipped silently in `crash-course-semester-zero`
before that project's own audit caught it**: an asset path that resolves fine in `npm run dev`
(where `src/assets/media/...` is served directly off the source tree) but doesn't survive
`vite build` into a form the production static host can serve at that same path. This repo's
own `HANDOFF.md` §5.3 even flagged this as a risk to check before deploying to a static
host — the risk was written down and then, evidently, not caught before this URL went live.

**Fix before anything else in this document:** run `npm run build && npm run preview` locally,
open the browser devtools network tab, and see whether the images resolve there. If they don't,
the fix is almost certainly either (a) moving `src/assets/media/` into a Vite `public/` folder
so it's served at a stable root-relative path regardless of build hashing, or (b) importing the
images as ES modules (`import apartmentUrl from './assets/media/apartment.png'`) so Vite
rewrites the reference correctly at build time instead of leaving a literal dev-only string
path in the shipped JS. Confirm which by testing — don't guess. Whichever fix is chosen, **update
`ASSET_MANIFEST.files` and `src/main.js`'s loader to match**, then redeploy and re-check the
live console before considering this closed.

**Deploy mechanism note:** this project deploys via a GitHub → Vercel connection (push to `main`
on `github.com/jamestown502502/gigworkerbaisinc` auto-redeploys), not a local `vercel deploy`
CLI call like the other two games. A local fix has to actually be committed and pushed to take
effect on the live URL — building locally and confirming in `npm run preview` is necessary but
not sufficient.

### Group B: Audio — real Lyria BGM instead of a repeating 4-chord loop

`FABLE-ENHANCEMENT-BRIEF.md`'s own "Sound Design (Procedural, Low Effort)" section already scopes
SFX enhancement (success/failure/ambient-feedback tones) — that's a reasonable, already-planned
piece of work, don't duplicate it here. What it doesn't propose is replacing the BGM itself.
That's the highest-value, lowest-risk audio change available: one file, one wiring point
(`startBGM`/`stopBGM` in `src/engine/audio.js`), no per-scene bed-switching logic needed (this
is a single continuous loop, not a multi-location game).

```bash
node ~/.claude/skills/user/game-music-generator/scripts/generate_music.mjs \
  --prompt "Lo-fi hip-hop, mellow, slightly melancholy, soft electric piano and vinyl crackle, loopable background music for a solo apartment-based simulation game, no vocals" \
  --filename src/assets/audio/apartment-bgm.mp3
```

(Same `GEMINI_API_KEY` already on this machine — see [[game-music-generator-skill]] or the
skill's own `SKILL.md` for prompting notes: always say "no vocals," always say "loopable.")

**Wire it with a plain `<audio>` element** — no Phaser Sound Manager exists in this stack, don't
try to port one:

```js
// src/engine/audio.js
let bgmAudio = null;

export function startBGM() {
  if (bgmAudio) return;
  bgmAudio = new Audio('/src/assets/audio/apartment-bgm.mp3'); // verify this path per §4 Group A's fix first
  bgmAudio.loop = true;
  bgmAudio.volume = 0.35;
  bgmAudio.play().catch(() => {}); // autoplay policy — call from the same click handler that already unlocks SFX
}

export function stopBGM() {
  bgmAudio?.pause();
  bgmAudio = null;
}
```

Keep the exported function names identical so nothing calling `startBGM()` elsewhere needs to
change. Update `manifest.js`'s `audio.bgm` entry from `{ type: 'procedural', func: 'playLofiBGM' }`
to `{ type: 'file', path: '...' }`. **Do this after fixing Group A, using whatever asset-loading
approach that fix settles on** — don't add a second, differently-broken asset path on top of an
already-broken one.

Leave all the SFX tone functions untouched.

### Group C: Visuals — close the biggest variety gap (one background for all 12 wildly different gigs)

Once Group A is actually fixed and images load at all, the next real gap is variety, not
quality. All 12 entries in `GIG_TEMPLATES` (`src/game/gigs.js`) — everything from "Yard Work —
Leaves & Mowing" to "Professional Cuddler" to "Water Slide Tester" to "Logo Design" — render
against the exact same single `work-location.png`. A water-slide-testing gig and an
IKEA-assembly gig currently look identical on screen.

**Two sizes of fix, pick one:**
- **Per-category (cheaper, recommended first pass)** — one new background per `type`:
  `physical`, `service`, `creative`, `weird`. 4 images instead of 1, swapped in based on
  `gig.type`.
- **Per-gig (fuller)** — all 12 templates get their own scene art. More generations, more
  personality, more wiring (a new `bgKey` field per template mapping to the right image).

**Smaller, cheap second opportunity:** weather is currently *just an emoji*. `WEATHERS` in
`src/game/weather.js` (5 entries: sunny/rainy/hot/cold/perfect) renders as `{ emoji, color }`
and nothing else. A real illustrated overlay/tint per weather state — rain streaks, heat
shimmer, snow — layered over whatever background is on screen would read as a much bigger
upgrade than the emoji currently delivers, for only 5 generated assets.

**Workflow:** same script as the Leaves of Deceit companion doc —
`crash-course-semester-zero/scripts/generate-image.mjs`, `gemini-3.1-flash-image`. Use the
locked reference-image workflow (generate one hero image, feed it back in as a reference for
the rest of the set) so the 4 category backgrounds — or 5 weather overlays — read as belonging
to the same city, not unrelated pictures. Load new images the same way `main.js` already does
(once Group A's fix lands) — this only extends the existing manifest pattern with more keys, no
new mechanism needed.

**What to leave alone:** `character.png` and its procedural color-customization fallback
(`character.js`) already work as designed — don't touch unless specifically asked for
outfit/expression states tied to game stats (tired/energized), which is a bigger, separate ask
from a background-variety pass.

### Group D: Other known improvement areas (already scoped elsewhere, not duplicated here)

This repo already has its own improvement docs — summarized here for full context, not repeated
in detail:
- `HANDOFF.md` §5 lists in-game tutorials/onboarding as not-yet-built, plus GitHub repo
  initialization (still not a git repo as of that doc) and a Lovable static-hosting deploy path
  as separate from the current Vercel one.
- `FABLE-ENHANCEMENT-BRIEF.md` has a full separate plan for game-feel polish — juicier
  microinteractions, particle effects on gig accept/reputation-up, animated HUD meters, weather
  visualization tags on gig cards — independent of anything in this document.

---

## 5. The one real technical gotcha to carry over (audio-specific)

**Path gotcha, verify don't assume:** confirm how Vite serves assets in this project's
`vite.config.js` before trusting any specific runtime path for a new BGM file — Vite handles
bare string paths differently than imported modules, and (per Group A) this project has already
shipped one silent asset-path failure to production. Mirror whatever fix Group A settles on for
images; don't introduce a second, independently-broken path for audio.

---

## 6. Minimum checklists

**Do Group A first, before anything else in this document** — a BGM upgrade or new background
art is pointless to ship on top of a page where images already don't load.

- [ ] **Group A:** reproduce locally with `npm run build && npm run preview`, fix the asset path
      (public folder vs. ES module import — test, don't guess), update `manifest.js` +
      `main.js`'s loader, redeploy, re-check the live URL's console for the six 404s
- [ ] **Group B:** generate BGM track (prompt above), wire via `<audio>` using the fixed asset
      path convention, update `manifest.js`
- [ ] **Group C:** confirm per-category (4 images) vs per-gig (12 images) scope before
      generating anything; use the locked reference-image workflow; wire off `gig.type` (or a
      new per-template field) wherever `work-location.png` is currently hardcoded
- [ ] Verify everything with `npm run build && npm run preview`, then on the actual live Vercel
      URL — not just `npm run dev`, which is what let Group A ship broken in the first place
