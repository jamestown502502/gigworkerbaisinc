# Gig Worker Simulator — Deploy & Roadmap

**Status:** Feature-complete, Session 2 polish pass done, ready for GitHub + Lovable. All game mechanics verified end-to-end with zero console errors.

---

## Current State (2026-07-14)

### Built & Working ✅
- Full game loop: apartment → browse gigs → travel → work (choices + QTEs) → results → evening (bills) → sleep
- **17 daily events** (flavor/gameplay/crisis) that fire 0–2 per morning with choice branches
- **5 weather types** (sunny/rainy/hot/cold/perfect) affecting energy costs, gig pools, and HUD display
- **Hidden health meter** (QTE difficulty + energy recovery scaling + forced rest days)
- **Morning flavor ticker** (conditional headlines + weather flavor + struggle/success lines)
- **9-step tutorial** (first-play only, persists to localStorage)
- **Weekly wrap-ups** (stats + adaptive headline after bills every 7 days)
- **Character customization** (skin/hair/shirt color, persisted)
- **Shop system** (7 upgrades with gameplay effects)
- **Bill payment system** (rent/phone/food, 7-day cycle, 14-day eviction)
- **Procedural gig generation** (12 templates, 6–8 per day, reputation-gated, weather-affected)
- **Full state persistence** (localStorage, survives browser close/reload)
- All text via `drawText()` with shadows/outlines. **Zero raw `ctx.fillText` calls.**

### Known Rough Edges (Pre-Public Polish)

1. **Mobile touch targets** — buttons are 44–52px (accessible) but could benefit from slightly more breathing room on very small phones (320px width). Test on an actual 375px viewport.
2. **Event balance** — "car trouble" and "dispute" events happen but may feel too punishing early-game. Consider weighting crisis events to day 3+ only.
3. **Tutorial pacing** — 9 steps is thorough but long (~30 sec). Consider allowing "skip tutorial" button on step 1 for returning players.
4. **QTE difficulty spike** — stress/health interact multiplicatively; at stress 80 + health 20, QTEs become very hard. May need a cap or smoothing.
5. **Weather flavor** — only Rainy cuts physical gigs; Hot/Cold add energy cost but don't visibly reshape the gig pool. Could add more weather-gig pairing (e.g., "Indoor gigs only" on Rainy).
6. **Repeat client mechanic** — clients can appear multiple times and get a 10% payout bonus + ♥ label, but the "repeat" pool doesn't refresh weekly; over time all gigs become repeats. Consider resetting 50% of the pool each week.
7. **No audio feedback on errors** — trying to accept when broke/too tired is silent. One "bzzt" SFX would help.
8. **Walkthrough/strategy guide** — no in-game tips on optimal play (when to rest, how to build reputation, upgrade priorities). New players may feel lost past the tutorial.

---

## Pre-Public Checklist

Run these before linking GitHub/Lovable:

- [ ] **Mobile test** — resize browser to 375×667 (iPhone SE), confirm all buttons are easily tappable, text readable
- [ ] **New game flow** — clear localStorage, start fresh, walk through tutorial → first day gigs → first sleep, confirm no glitches
- [ ] **Week 1 complete** — reach day 7, trigger bills, pay/skip, see wrap-up, sleep into week 2, confirm week stats reset
- [ ] **Eviction** — deliberately skip 14 rent payments, confirm GAMEOVER screen, new-game button works
- [ ] **No console errors** — F12 → Console tab, no red errors or warnings (yellow warnings OK)
- [ ] **Performance** — watch for frame drops or lag, especially during event modals or heavy gig scrolling
- [ ] **Cross-browser** — test in Chrome, Firefox, Safari (if possible); confirm audio works, no rendering glitches

---

## Polish Recommendations (Nice-to-Have, Not Blocking)

### High Impact (30 min each)
1. **Prevent early-game crisis hammer** — move crisis event weights to day 3+; tone down "car trouble" and "dispute" cost/impact on days 1–2.
2. **Repeat client reset** — every Monday (day 1 of new week), shuffle 30% of repeat clients back into the available pool so the board stays fresh.
3. **Error SFX** — add one "bzzt" sound when trying to accept a gig you can't afford/don't have time for.
4. **"Skip Tutorial" button** — on tutorial step 1, show a small "[skip]" link so vets can jump straight to playing.

### Medium Impact (1–2 hours)
5. **Walkthrough tips** — add an "?" help button on gigs that shows: "Rest when health < 30", "Build rep for better gigs", "Upgrades boost income".
6. **Weather-aware gig reshaping** — on Rainy, explicitly remove all outdoor gigs and add 2 indoor service gigs to the pool so it's visibly different, not just energy-penalized.
7. **Accessibility pass** — check color contrast (HUD meters vs dark BG), test with browser zoom (200%), verify keyboard nav isn't needed but works if tabbed.

### Lower Priority (Can ship without)
8. **Leaderboard / stats summary** — "Best lifetime earnings", "Fastest to $2k", "Highest rep", stored in localStorage
9. **Settings panel** — toggle audio on/off, adjust text size, change HUD layout
10. **Skin tone / hair / shirt store** — unlock more colors as reputation increases (cosmetic rewards)

---

## GitHub Setup (Do This Today)

```bash
cd C:\Users\Jbthi\gig-worker

# 1. Initialize repo
git init

# 2. Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
dist/
*.log
.env
.env.local
.DS_Store
EOF

# 3. Stage & commit
git add .
git commit -m "Initial commit: Gig Worker Simulator game

- Full game loop with daily events, weather, health system, tutorial
- 5 screens + HUD, immediate-mode Canvas rendering
- Procedural gig generation, choice trees, QTE minigames
- localStorage persistence, weekly wrap-ups
- All text readability + rounded buttons + gradient UI"

# 4. Add remote (you'll need your GitHub token ready)
# Replace YOUR_USERNAME and YOUR_REPO_NAME:
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main

# 5. (Optional but recommended) Create a GitHub release
# Go to https://github.com/YOUR_USERNAME/YOUR_REPO_NAME/releases
# Click "Create a new release" → tag: v0.1.0 → "Initial web release"
```

**GitHub Token:** You mentioned it's pending. Once you have it, GitHub's web UI will prompt you to paste it. Or use the GitHub CLI: `gh auth login` → paste token at the prompt.

---

## Lovable Deploy (After GitHub Push)

Lovable's static hosting works best with pre-built output:

```bash
# 1. Build the project
npm run build

# 2. This creates dist/ — a folder with index.html + bundles ready to serve as static
# 3. In Lovable:
#    - Create a new static site project
#    - Upload the contents of dist/ (or drag-and-drop the folder)
#    - Lovable will auto-detect index.html and serve it

# 4. Check the Lovable URL — assets should load, game should run
# 5. If assets fail to load, Vite's base path might need adjustment:
#    Open vite.config.js, set base: '/gig-worker/' if deployed to a subpath
#    Then rebuild and re-upload dist/
```

---

## Post-Launch: Feedback & Android Phase

### Web Feedback Loop (Week 1–2)
After publishing:
1. **Share URL** with a small group (friends/testers)
2. **Collect feedback** on:
   - Is the tutorial clear? Do new players understand the four meters?
   - Are events fun or frustrating? Which ones feel unfair?
   - Is the difficulty curve right? (Too easy early? Too hard mid-game?)
   - Do mobile controls feel good? Any tap-target complaints?
   - Are there bugs or exploits?
3. **Track playtime** — how long do players last before quitting? (goal: >5 minutes, >1 week in-game)

### Android Port (Post-Feedback)

Once web version stabilizes:
- **Framework:** React Native or Flutter (both can wrap Canvas + Web Audio)
- **Asset prep:** Sprites + audio already exist; bundle them into the app
- **State sync:** localStorage → SQLite or native storage (no backend needed, stays offline)
- **Distribution:** Google Play + Apple App Store

**Estimated effort:** 2–4 weeks (framework choice → UI adaptation → testing → store submission).

---

## File Structure Recap

```
gig-worker/
├── index.html                    # Entry point
├── package.json, vite.config.js  # Build config
├── .gitignore                    # Git exclusions
├── HANDOFF.md, DEPLOY.md         # These docs
├── PRD.md, ONE-SHOT-PROMPT.md    # Design specs
└── src/
    ├── main.js                   # Bootstrap + drawSprite()
    ├── engine/
    │   ├── canvas.js, input.js, audio.js, state.js
    ├── game/
    │   ├── loop.js (state machine), gigs.js, choices.js, qte.js
    │   ├── events.js, weather.js  # New Session 2
    └── ui/
        ├── screens.js, hud.js, character.js, listings.js
        └── text.js, tutorial.js   # New Session 2
```

---

## Quick Reference: Commands

```bash
# Development
npm run dev          # Start Vite server at http://localhost:5173

# Production
npm run build        # Generate dist/ for deployment
npm run preview      # Test the built version locally

# Git
git status           # Check what changed
git log --oneline    # View commit history
```

---

## Success Criteria for v1.0 (Public)

- [x] Game is playable end-to-end (DONE)
- [x] UI is readable and styled (DONE)
- [x] No console errors (DONE)
- [ ] Mobile test pass (pre-deploy checklist)
- [ ] At least 3 external testers play it without getting stuck
- [ ] Event/difficulty balance feels fair (gather feedback)
- [ ] ~50% of testers play past day 7
- [ ] GitHub repo public + Lovable live

---

**You're at the finish line. Go test it, polish the rough edges you care about most, push to GitHub today, and let's see how players respond. Android can wait until we know the web version resonates.**
