# Gig Worker Simulator — Handoff & Current Status

**Updated:** 2026-08-13
**Status:** Live, public, fully playable, actively maintained. One critical fix and one large
polish pass shipped today.
**Live URL:** **https://gigworkerbaisinc.vercel.app** — free, no login, works on phone or
desktop.
**Source:** `C:\Users\Jbthi\gig-worker` — public on GitHub at
`github.com/jamestown502502/gigworkerbaisinc`. **Deploys via GitHub → Vercel auto-deploy**: a
push to `main` redeploys automatically. There is no separate manual deploy step, and a local
build alone does **not** affect the live URL until it's pushed.
**Stack:** Vite + vanilla JavaScript + HTML5 Canvas. No framework, no Phaser — a custom
immediate-mode UI and a custom render loop.

This document is meant to stand alone — a cold read for anyone picking this project up.

---

## 1. What this game is

**Gig Worker Simulator** is a mobile-first browser life-sim about making rent one week at a
time. You play someone piecing together income from short-term local gig work — a
Craigslist-style listings board come to life. Each day you browse available jobs, accept the
ones that fit your energy and risk tolerance, travel to them, work through a branching
choice-tree scenario (sometimes with a quick-time-event minigame), get paid, and manage four
meters — **cash, stress, reputation, energy** — while rent, phone, and food bills keep coming
whether you worked or not.

The tone is wry and a little absurd, grounded in real gig-economy anxiety without being grim
about it. The job board ranges from mundane (yard work, dog walking, IKEA assembly) to openly
weird (Water Slide Tester, Professional Cuddler, Mattress Tester — Hotel Review), and the
weirdness is the point, not an accident.

---

## 2. Full playthrough — what you actually get, day by day

**Morning.** You wake up in your apartment — now a real illustrated scene (see §3, this used to
render as a black screen on the live site). Customize your character's skin tone, hair color,
and shirt color; it persists. You see your four meters and the day count at the top.

**Browse listings.** The board generates gigs from **12 templates across 4 categories** —
`physical`, `service`, `creative`, `weird` — gated partly by your reputation (creative gigs
need reputation ≥2 or a laptop upgrade; weird gigs need reputation ≥3) and reshaped by the
day's weather (a rainy day visibly pulls all outdoor work off the board). Each listing shows a
payout range, time cost, risk level, and location safety tier, with a warning banner if your
stress is high enough to make today's quick-time events noticeably harder.

**Accept, travel, work.** Accepting a gig now shows a **background specific to its category**
(a driveway/moving-truck scene for physical gigs, a porch/toolbox scene for service, a home
studio for creative, a water-slide scene for weird — this used to be one identical generic
background for all 12 job types). You then work through a branching choice tree specific to
that job — 12 total, with real consequences (accepting an overload for a bonus vs. protecting
your energy, setting boundaries with a difficult client, deciding whether a listing is a scam
before you accept it).

**Quick-time events.** Some gigs additionally trigger one of 3 minigames — Rhythm Tap, Timed
Sequence, or Steady Hand — with difficulty that scales with your current stress and energy
(high stress and low energy genuinely make these harder, which is the game's way of making
burnout mechanically real). Every QTE now opens with a brief "GET READY" beat before input
matters, and a near-miss gives partial credit instead of an instant zero. A Settings toggle
("Reduce Timing Pressure") widens every QTE's window for players who can't react to pure
timing.

**Get paid — or scammed.** A risk roll on every gig determines whether the client actually pays
as agreed; a bad roll (worse with unreliable clients) means a shortchange or a no-show, with a
screen-shake-and-color-flash moment that matches the sting. A good payout gets a cash-register
sound, a particle burst, and a floating "+$X" popup over your cash meter.

**Evening and bills.** Rent ($600), phone ($40), and food ($50) accrue on a 7-day cycle; miss
enough rent and eviction hits at 14 overdue days — that's the game-over condition. An upgrade
shop (7 upgrades — a tool belt, a bike, a laptop, work gloves, and more) lets your earnings
compound. Sleep advances the day and recovers energy.

**First-time players get a 9-step guided tutorial** explaining the four meters, how bills work,
and what triggers eviction — skippable for anyone who's played before.

**A full run is a 30-day survive-the-month structure** (per the game's own marketing framing —
see §4), with a weekly rent cycle and a rotating pool of 17 possible random daily events that
can help or hurt a given run.

---

## 3. Current status — everything fixed or added today, in order

### Fix 1 — the critical bug (fixed and verified first, before anything else)

**Confirmed:** every background/sprite image was 404ing on the live production URL — the game
was playable but looked like a black-and-text game to anyone actually visiting the link, not
the illustrated game it is in local development. Root cause: image paths were written as
`src/`-relative strings, which only ever resolve in `npm run dev` (where Vite happens to serve
the whole project root); the production build never bundled them. **Fixed** by moving all
images into Vite's `public/` folder, which is copied verbatim into every build regardless of
environment. Verified: all 6 original images plus every image added since, confirmed loading
with HTTP 200 on the actual live URL, not just locally.

### Fix 2 — a full polish pass, 8 parts

1. **Performance.** Capped rendering resolution at 2x device-pixel-ratio (some phones were
   rendering 3-4x more pixels than needed); the render loop now actually pauses when the browser
   tab is backgrounded instead of just relying on browser throttling; removed a per-frame array
   reallocation in the UI hit-testing system.
2. **Quick-time-event fairness/accessibility.** Added a grace zone to the Rhythm Tap minigame (a
   near-miss now gives partial credit instead of an instant zero), a "GET READY" beat before any
   QTE's input goes live, and a Settings toggle that widens every QTE window for players who
   struggle with pure-timing challenges. The existing hard difficulty cap ("never truly
   unwinnable," already in the code) and the shape/position-based core mechanics (not
   color-only) were already correct.
3. **Game feel.** Added screen shake and a full-screen color-wash on quick-time-event outcomes
   and on scams, floating "+$X"/"+stress" number popups over the relevant HUD meter, and a
   sparkle burst on reputation gains. The existing tweened meter bars and payout particle bursts
   were already in place.
4. **Real music, and a way to control it.** Replaced the previous 4-chord `setInterval` loop with
   a real generated lo-fi background track. Added a Settings modal (opened from a new gear icon
   in the HUD) with master/music/SFX volume sliders and a mute toggle, saved separately from your
   run so it survives starting a new game.
5. **Visual variety.** Generated 4 new backgrounds — one per gig category — so a water-slide job
   and an IKEA-assembly job finally look different from each other; the single generic background
   they used to share is gone. Weather also went from an emoji-only display to 5 illustrated
   overlay textures (rain streaks, heat shimmer, snow, sun glow, sparkle) layered subtly over the
   active scene.
6. **Mobile hardening.** Fixed a real multi-touch bug: a second finger touching down mid-QTE was
   re-reading the first finger's (unmoved) position and firing a duplicate tap in the wrong place
   — now ignored. Added standard mobile CSS hardening (`touch-action`, `overscroll-behavior`,
   safe-area padding for notched phones) on top of the zoom-prevention that already existed.
7. **Onboarding.** The existing 9-step tutorial was already solid and untouched. Added
   tap-to-reveal explanations on each HUD meter, and a reliable warning on the listings screen
   when stress is high enough to make today's QTEs noticeably harder (previously this only
   showed up as one of several random daily tips, hit-or-miss).
8. **Save robustness.** A corrupted or malformed save in the browser's local storage previously
   crashed the game on load with no recovery; it now falls back gracefully to a fresh save.
   Settings (audio prefs, accessibility toggle) now persist independently of your run and survive
   starting a new game, the same way they do in the other two Bennett AI Solutions games.

Both fixes were committed, pushed to `main`, confirmed redeployed via Vercel, and re-verified on
the actual live URL — not just locally — before being called done.

---

## 4. Marketing copy — official, approved, use verbatim

*(This is the finalized store/marketing copy from the original ship; it's still accurate after
today's fixes — nothing about the core pitch changed, only what the game actually looks and
feels like playing it.)*

> **Gig Worker Simulator**
> Survive 30 days of odd jobs, rising stress, and weekly rent in a gritty gig-work sim.
>
> Gig Worker Simulator is a choice-driven survival sim about making rent one week at a time.
> Browse a classifieds-style job board, take on unusual gigs, and balance cash, energy, stress,
> and reputation as each day brings new risks.
>
> Dynamic weather changes the jobs you can find, random daily events can shift your momentum,
> and a hidden burnout system punishes overwork. Skill-based challenge moments get harder as
> fatigue builds, turning every decision into a tradeoff between survival now and stability
> later.
>
> - Survive a 30-day run with rent due every 7 days.
> - Take on strange gigs from a rotating job board.
> - Adapt to weather-driven changes in opportunity.
> - Manage burnout, stress, reputation, and energy.
> - Navigate 17 random events that can save or sink a run.
> - Master challenge sequences that scale with exhaustion.
>
> Published by Bennett AI Solutions Inc.

**Social/launch copy style** (used for the original Twitter/X post — reuse this pattern for
future updates, swapping in whatever's actually new): a one-line tagline, a 4-bullet feature
list, and an explicit build-credit line ("Built in Node.js, one-shot with Claude Fable" for the
original build).

---

## 5. Technical reference

- **Android:** the repo was sent to a Fiverr freelancer for an Android port as of the last check
  — this is why today's live-URL fix was treated as urgent and shipped as its own commit before
  the larger polish pass, rather than bundled together.
- **Immediate-mode UI:** every frame, `Game.render()` draws the current screen and registers
  clickable hotspots via `UI.register(x,y,w,h,cb)`; there's no retained widget tree. To restyle
  any button, edit the single shared `button()` function in `src/ui/screens.js`.
  Coordinate space is a fixed logical 800×600 — `InputManager.toLogical()` maps real click/touch
  positions back to that space regardless of how the canvas is scaled on screen.
- **Asset generation:** use `~/.claude/skills/user/game-image-generator/` for any new art (has
  an automated transparency check built in) and `~/.claude/skills/user/game-music-generator/`
  for audio — both were built this session specifically so the Semester Zero/Gig Worker classes
  of silent asset bugs are structurally harder to ship again.
- **Testing gotcha:** the in-app browser pane throttles `requestAnimationFrame` heavily during
  automated testing — drive the game loop manually (`game.update()`/`game.render()`) rather than
  relying on real elapsed time between synthetic clicks, and expect `scene.start()`-equivalent
  state transitions to need a real `await sleep(...)` yield to actually process.
- **What's still on the table, not done today:** a full ~44px touch-target audit across all
  interactive elements (a handful of the most undersized were bumped; the rest weren't
  systematically reviewed), and the Lovable static-hosting deploy path mentioned in earlier
  planning docs (this project deploys via GitHub → Vercel only, as noted above).

---

## 6. QA-response pass — fixes, transitions, evening loop, test harness (2026-09-12)

Triggered by an external Fiverr QA report (25 defects, desktop Chrome/Firefox, iPhone 15,
OnePlus 9R). Every row has a root cause and a fix; the full row-by-row table lives in
`C:\Users\Jbthi\Claude Cowork\BAIS_TwoGame_FixPolishExpand_Plan_2026-09-12.md` §2 and the
before/after doc `BAIS_GigWorker_BeforeAfter_QAPass_2026-09-12.md`.

**Test harness (new — the repo had zero tests before this pass).**
- `npm test` — Vitest, `tests/unit/`: results-ledger invariant over 400 random gigs, energy
  gate, day-30 end, every event choice vs. its outcome text, save migration, groceries, choice
  tree integrity, all four new minigames, and a 360-run Monte Carlo balance suite (three
  scripted strategies, band assertions).
- `npm run test:e2e` — Playwright, `tests/e2e/`, four projects: desktop Chromium 1920×1080,
  desktop Firefox, Pixel 7 (Android Chrome), iPhone 14 (WebKit). Boots the production build via
  `vite preview`. Includes a **text-overlap sweep** (every screen rendered with a text probe; no
  two visible strings may intersect) and a transitions test (every kind finishes ≤ 0.6 s and
  leaves no hotspot). Two tests skip on the iPhone project because Playwright's Windows WebKit
  build has no Web Audio and no mouse wheel — real iOS Safari has both.
- `.github/workflows/ci.yml` runs unit → build → e2e on every push.
- Dev hooks: `window.__game`, `window.__state`, `game.step(seconds)` (fixed 60 Hz ticks with
  render, so input is processed), `game.tap(x, y)`, `window.__textProbe`.

**Engine changes.**
- `engine/canvas.js`: uniform 4:3 fit to the container on resize/orientation (was fixed
  800×600 CSS px clamped per axis → stretched on phones, tiny on desktop).
- `engine/input.js`: Pointer Events with a tap-vs-drag threshold; `consumeDrag()`,
  `consumeWheel()`, `isPressedIn()`; audio unlock hook fires on `pointerup` (never `touchstart`,
  which is not a user-activation event on Android Chrome).
- `engine/audio.js`: `unlock()`, `contextState()`, graceful no-Web-Audio path, four new cues.
- `engine/sprites.js`: `drawSprite`/`imageCache`/`loadAssets` moved out of `main.js` so modules
  can be imported without booting; per-image 6 s timeout + a visible loading bar.
- `engine/state.js`: save `version` 2 with backfill, `support`, evening fields, `runComplete`,
  `freePlay`, `settings.reduceMotion`.
- `ui/transition.js` (new): phase transitions with the switch at the midpoint; kinds `phone`,
  `commute`, `doorway`, `receipt`, `dusk`, `sunrise` (day odometer), `paper`, `fade`. Input is
  dropped and hotspots cleared while one plays. Reduce Motion collapses all to a 0.14 s fade.
- `game/loop.js`: `setPhase(next, kind)`; single results **ledger** (headline = Σ items = cash
  delta, by construction); hard energy gate at accept; `SUMMARY` phase at day 30 with explicit
  Free Play; events wait for a tap; ticker no longer swallows button taps; `UI.absorb()` under
  every modal; evening choice + late-ping boundary decision; `sleepRecovery()` by Balance band.
- `game/qte.js`: `Breathe`, `ReadClient`, `ThreadGame` (client Text Back / friend Check In),
  `createEIGame`, `createEveningGame`, `drawFace`; RhythmTap's between-round rest is now on the
  game clock, not `setTimeout`.
- `game/choices.js`: social gigs open with a `{ minigame, next }` node.
- `ui/hud.js`: five meters (Balance = the formerly hidden `health`), half-star reputation,
  "Rent due in N days", separate mute button.

**Design decisions applied (from the plan, Jameson approved the recommendations):** energy is a
hard gate at accept and in-gig costs may drain to 0 (day then ends); day 30 → Summary → explicit
Free Play; Reduce Motion off by default. The tester's "Breathme" screen (row 17) does not exist
under that name — the closest is Steady Hand; the overlap sweep now guards every minigame frame.
