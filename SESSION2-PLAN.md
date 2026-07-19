# Session 2: Oregon Trail Meets Gig Economy

> Quality-gated implementation plan for Claude Fable.
> Cold-start: read `HANDOFF gig worker.txt` from Downloads first, then return here.

---

## Before & After

### Before (current state)

| Element | Status |
|---|---|
| Game loop | ✅ MORNING → BROWSE → TRAVEL → GIG → RESULTS → EVENING + GAMEOVER |
| Gig system | ✅ 12 templates, 6 per day, reputation-gated, procedurally generated |
| Choice trees | ✅ 12 trees with branching, chance, item requirements |
| QTE mini-games | ✅ 3 types (rhythm tap, timed sequence, steady hand) with stress/energy scaling |
| Meters | ✅ Cash + Stress + Reputation + Energy with UI bars |
| Bills | ✅ Rent/phone/food every 7 days, overdue tracking, eviction at 14 days |
| Shop | ✅ 7 upgrades with persisted effects |
| Character | ✅ Procedural pixel character with skin/hair/shirt customization |
| UI polish | ✅ Rounded gradient buttons, styled gig cards, dark overlays, shadowed text |
| **Text readability** | ❌ Raw `ctx.fillText()` calls throughout — inconsistent sizing, no shadows, hard to read on mobile |
| **Daily variety** | ❌ Every day is identical: wake, pick gig, work, sleep. No weather, no random events, no flavor |
| **Tutorial** | ❌ No onboarding — new players thrown directly into the deep end |
| **Health system** | ❌ No health/sickness — stress is the only physical feedback |
| **Weekly feedback** | ❌ No wrap-up or progress reflection |
| **GitHub** | ❌ Not initialized — no source control |
| **Performance** | ⚠️ Unknown — need to verify no per-frame allocation issues |

### After (target state)

| Element | Status |
|---|---|
| **Text readability** | ✅ Zero raw `ctx.fillText()` calls. Every text element uses `drawText()` with context-appropriate sizes (16-24px), shadows/outlines, and consistent font family |
| **Daily events** | ✅ 15+ random events in 3 tiers: flavor (texture), gameplay (stat effects), crisis (high impact). 0-2 fire per morning. Events with choices show choice UI |
| **Weather system** | ✅ 5 weather types (sunny/rainy/hot/cold/perfect). Each affects energy costs, gig pool, and HUD display. Weighted rolls. Weather emoji + color in HUD |
| **Health system** | ✅ Hidden health meter (0-100). Decays from skipped food, high stress, sickness. Affects QTE difficulty and energy recovery. Forced rest day at 0 health |
| **Morning ticker** | ✅ Procedural headlines + weather flavor + context-aware struggle/success lines. Auto-fades. "Check Listings" appears after ticker completes |
| **Tutorial** | ✅ 9-step guided walkthrough covering all mechanics. Semi-transparent overlay with pulsing highlight. Click to advance. Persistent skip flag |
| **Weekly wrap-up** | ✅ Day 7 shows summary: earnings, gigs completed, reputation, survival days. Headline adapts to performance. Stats reset for next week |
| **GitHub** | ❌ Still not initialized (out of scope for this session) |
| **Performance** | ✅ No per-frame allocations. Events/weather rolled once per morning. Ticker uses single timer. Tutorial overlay adds no overhead when inactive |

---

## Step 0: Fix Every Text Call (Do This First — Before Anything Else)

The previous build produced hard-to-read text. Every screen uses raw `ctx.fillText()` calls with inconsistent sizing and no shadows.

### Search-and-Replace

Search every `.js` file in `src/ui/` and `src/game/` for these patterns:

```regex
ctx\.fillText\(    # Replace ALL instances with drawText()
ctx\.font =        # Replace ALL instances (font is set inside drawText())
```

The shared `drawText()` function already exists in `src/ui/text.js`. Verify it has this signature:

```javascript
export function drawText(ctx, text, x, y, options = {}) {
  const {
    size = 18,
    color = '#ffffff',
    font = 'system-ui, sans-serif',
    align = 'left',
    baseline = 'top',
    shadow = true,
    outline = false,
    maxWidth = undefined
  } = options;

  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;

  if (shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
  }
  if (outline) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x, y, maxWidth);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth);

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
}
```

### Size Reference

| Context | Size | Color | Font | Shadow | Outline |
|---|---|---|---|---|---|
| HUD values | 16 | `#f0f0f0` | monospace | Yes | No |
| Button labels | 16 | `#ffffff` | system-ui | No | Yes |
| Body/description | 18 | `#e0e0e0` | system-ui | Yes | No |
| Headings | 24 | `#ffffff` | system-ui | Yes | No |
| Gig card titles | 16 | `#ffd700` | system-ui | Yes | No |
| Choice text | 17 | `#d0d0d0` | system-ui | Yes | No |
| Event flavor text | 15 | `#aaaaaa` | system-ui | No | No |
| Tutorial text | 18 | `#ffffff` | system-ui | No | Outline |

### Verification

```bash
# Search for remaining raw fillText calls:
grep -rn "ctx\.fillText\|ctx\.font =" src/ui/ src/game/
# Expected output: ZERO matches (all replaced with drawText)
```

### Gate

- [ ] Zero raw `ctx.fillText()` or `ctx.font =` calls in `src/ui/` or `src/game/`
- [ ] Every text element uses `drawText()` with appropriate size/color/shadow from the table above
- [ ] `npm run dev` loads without errors
- [ ] All existing screens render with readable text (apartment, listings, gig, results, evening, game over)

---

## Step 1: Random Daily Events

### What to Build

Create `src/game/events.js` with an event pool, an event engine, and wire it into the morning screen.

### Event Pool (15+ events)

```
TIER 1 — Flavor Events (weight 2-3, no stat impact, just texture)
├── "A stray cat follows you for two blocks before giving up."
├── "Your neighbor leaves a box of free vegetables on the stoop."
├── "You find $5 in an old jacket pocket."
├── "Your favorite song plays on the radio. You smile."
├── "A double rainbow arches over the city. You take a moment."

TIER 2 — Gameplay Events (weight 1-3, stat effects or choices)
├── "Your car won't start. Mechanic quotes $150." → Pay or bus
├── "Heatwave! Outdoor gigs cost +5 energy today."
├── "A regular client refers you — bonus high-paying gig."
├── "Your phone dies. Only gigs you already accepted."
├── "Sudden rainstorm! Travel costs +2, indoor gig bonuses."
├── "Free coffee at the cafe. -5 stress."
├── "Flat tire on the way. Lose $40 and 30 minutes."

TIER 3 — Crisis Events (weight 1, rare, high impact)
├── "You catch a cold from working in rain. Health drops, 3 days recovery."
├── "Client disputes payment. Account frozen 24 hours."
├── "Landlord posts eviction notice. Pay $300 today or lose rep."
├── "Former client offers week of steady double-pay work." → Take it or stay
```

### Event Engine (src/game/events.js)

```javascript
export function rollDailyEvents(state) {
  const events = [];
  const roll = Math.random();
  if (roll < 0.30) return events;      // 30%: no events
  if (roll < 0.70) events.push(pickWeighted(EVENTS));  // 40%: 1 event
  else {                                // 30%: 2 events
    const e1 = pickWeighted(EVENTS);
    let e2 = pickWeighted(EVENTS);
    while (e2.id === e1.id) e2 = pickWeighted(EVENTS);
    events.push(e1, e2);
  }
  return events;
}

function pickWeighted(pool) {
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) { r -= e.weight; if (r <= 0) return e; }
  return pool[0];
}
```

### Wire Into Morning Screen

In `loop.js`, after waking up and before "Check Listings" appears:

1. Call `rollDailyEvents(state)`
2. Store result in `state.dailyEvents`
3. Draw events in order:
   - Flavor: auto-dismiss after 2 seconds (fade out)
   - Gameplay with choices: show choice UI, wait for click
   - Gameplay with effects: apply immediately, show brief text
   - Crisis: show as highest priority (always last, most important)

### Checks

- [ ] Wake up 5 times — verify 0, 1, or 2 events fire (never 3+)
- [ ] Flavor events show text, auto-dismiss after 2s, no stat changes
- [ ] Gameplay events with choices show buttons, clicking applies correct result
- [ ] Gameplay events with effects modify stats correctly (verify state after)
- [ ] Crisis events with `lockListings` actually prevent gig board access
- [ ] Crisis events with `coldDays` persist day-to-day

### Gate

All 6 checks pass. No console errors. Events feel varied across 5+ wake cycles.

---

## Step 2: Weather System

### What to Build

Weather roll, HUD display, and gig generation modifiers.

### Weather Types

| ID | Name | Emoji | Color | Energy Mod | Effect |
|---|---|---|---|---|---|
| `sunny` | Sunny | ☀️ | `#f1c40f` | 0 | Normal day |
| `rainy` | Rainy | 🌧️ | `#3498db` | +2 | Fewer physical gigs |
| `hot` | Hot | 🔥 | `#e74c3c` | +3 | Energy penalty on all gigs |
| `cold` | Cold | ❄️ | `#85c1e9` | +2 | Energy penalty on outdoor gigs |
| `perfect` | Perfect | ✨ | `#2ecc71` | -2 | Bonus gigs appear (8 instead of 6) |

### Weather Roll (add to morning routine)

```javascript
export function rollWeather() {
  const r = Math.random();
  if (r < 0.30) return WEATHERS[0];  // sunny (30%)
  if (r < 0.50) return WEATHERS[1];  // rainy (20%)
  if (r < 0.65) return WEATHERS[2];  // hot (15%)
  if (r < 0.80) return WEATHERS[3];  // cold (15%)
  if (r < 0.90) return WEATHERS[4];  // perfect (10%)
  return WEATHERS[0];                // fallback
}
```

### HUD Display

In `src/ui/hud.js`, next to the day counter:
- Weather emoji + name (e.g., "☀️ Sunny")
- Color-coded (use the weather's color)
- Use `drawText()` with `size: 16, color: weather.color`

### Gig Generation Effect

In `src/game/gigs.js`, `generateDailyGigs()`:
- If `weather.id === 'rainy'`: filter out `type: 'physical'` gigs, increase `service` gigs
- If `weather.id === 'hot'` or `'cold'`: add `weather.energyMod` to all gig energy costs
- If `weather.id === 'perfect'`: generate 8 gigs instead of 6
- Display energy modifier on gig cards (e.g., "+3 energy due to heat")

### Checks

- [ ] Wake up 10 times — all 5 weather types appear at least once
- [ ] Weather emoji + name renders in HUD with correct color
- [ ] Rainy day: listings board has zero `physical` gigs
- [ ] Hot day: gig cards show "+3 energy" modifier
- [ ] Perfect day: 8 gigs instead of 6
- [ ] Weather stays consistent all day, changes on sleep

### Gate

All 6 checks pass. HUD weather is immediately readable at a glance (emoji + color). Weather effects are visible on gig cards.

---

## Step 3: Health/Sickness System

### What to Build

A hidden health meter with decay triggers and gameplay effects. Invisible to casual players.

### State Additions

```javascript
// In GameState constructor:
this.health = 100;
this.coldDays = 0;
this.ateYesterday = true;  // set to false if couldn't afford food
this.healthWarningShown = false;
```

### Health Decay (applied on wake-up)

```javascript
function applyHealthDecay(state) {
  // Food skipping penalty
  if (!state.ateYesterday) state.health -= 5;

  // Chronic stress
  if (state.stress > 70) state.health -= 3;

  // Sickness recovery
  if (state.coldDays > 0) {
    state.coldDays--;
    state.health -= 5;
    if (state.coldDays === 0) state.health += 10; // recovering
  }

  // Natural recovery
  if (state.energy > 80 && state.health < 100) state.health += 2;

  state.health = Math.max(0, Math.min(100, state.health));
}
```

### Health Effects

- **QTE difficulty:** multiply difficulty by `(1 + (100 - health) / 100)`. A player with 50 health has 1.5x harder QTEs.
- **Energy recovery at night:** multiply recovery by `(health / 100)`. A player with 50 health recovers half as much energy.
- **Low health warning (health < 30):** "You feel run down. Rest recommended." in the morning ticker.
- **Health = 0:** forced rest day. Skip all gigs. Show "You're too sick to work today." Auto-recover +20 health.

### Checks

- [ ] Set `state.health = 10` in console — QTE difficulty visibly increases
- [ ] Set `state.health = 10` — energy recovery at night is halved
- [ ] Set `state.health = 0` — forced rest day triggers (can't access listings)
- [ ] Skip food for 3 days in a row — health drops each day
- [ ] Cold from event — coldDays counter ticks down, health affected
- [ ] Health naturally recovers when energy > 80

### Gate

All 6 checks pass. Health is completely invisible to a new player — no meter, no UI element — but tangibly affects gameplay.

---

## Step 4: Morning Flavor Ticker

### What to Build

Procedural flavor text that appears on wake-up, providing narrative texture.

### Flavor Text Generator

```javascript
const HEADLINES = [
  'City council debates gig worker protections.',
  'Local coffee shop hires only gig workers now.',
  'Study finds 1 in 3 gig workers skip meals to save money.',
  'New app promises better pay. You\'ve heard that before.',
  'Neighborhood watch reports uptick in package thefts.',
  'Gas prices tick up again.',
  'A heat advisory is in effect for the afternoon.',
  'The city is testing a new bike lane on 5th Street.',
  'Your favorite food truck is on Main Street today.',
  'A local nonprofit offers free breakfast to workers.',
];

export function generateMorningFlavor(state, weather) {
  const lines = [pick(HEADLINES), weather.flavor];
  if (state.cash < 200) lines.push(`Rent's due in ${state.daysUntilBills} days. You're stretched thin.`);
  if (state.reputation > 3) lines.push('A regular left you a 5-star review!');
  return lines;
}
```

### Display

On the apartment screen, show lines at the top of the content area:
- Each line fades in (`ctx.globalAlpha` animation over 500ms)
- Stays for 2 seconds
- Fades out over 500ms
- Next line starts after previous finishes
- Use `drawText()` with `size: 15, color: '#aaaaaa'`, no shadow
- After all lines fade out, show "Check Listings" button

### Checks

- [ ] Wake up — see 2-3 lines of flavor text
- [ ] Text fades in, stays 2s, fades out (smooth, not instant)
- [ ] "Check Listings" button appears only after ticker completes
- [ ] Lines differ each day (run 5 mornings, verify variety)
- [ ] Cash < 200: struggle lines appear
- [ ] Reputation > 3: success lines appear

### Gate

All 6 checks pass. Ticker adds atmosphere without slowing down gameplay (total duration ~6 seconds for 2 lines).

---

## Step 5: Tutorial / Onboarding

### What to Build

A 9-step guided walkthrough that fires on first play. Intercepts the state machine to guide the player through their first full day.

### Tutorial Steps

| # | Phase | Highlight | Text |
|---|---|---|---|
| 1 | morning | (center overlay) | "Welcome to the gig economy. Survive the month: pay rent, stay healthy, build reputation." |
| 2 | morning | meters area | "Your four meters. Keep them all in check." |
| 3 | morning | Check Listings btn | "Tap to see today's available gigs." |
| 4 | listings | gig card area | "Each gig shows payout, hours, location, and risk." |
| 5 | listings | Accept Gig btn | "Select a gig and accept it." |
| 6 | gig | choices area | "Your choices matter. They affect your stats." |
| 7 | gig | QTE area | "Some gigs have quick-time events. Stress makes them harder." |
| 8 | evening | bills area | "Rent is due every 7 days. Miss 14 = game over." |
| 9 | evening | Sleep btn | "Sleep ends the day. Energy recovers. Fresh gigs tomorrow." |

### Tutorial UI

```
┌─────────────────────────────────────────┐
│  (semi-transparent overlay: rgba(0,0,0,0.7))  │
│                                         │
│                                         │
│     ┌─── pulsing highlight ────┐        │
│     │   (around target element) │        │
│     └──────────────────────────┘        │
│                                         │
│     ┌─── speech bubble ─────────┐       │
│     │                          │       │
│     │  Tutorial text here      │       │
│     │                          │       │
│     │    [Tap anywhere]        │       │
│     └──────────────────────────┘       │
│                                         │
└─────────────────────────────────────────┘
```

- Highlight border: `2px solid #5dade2` with `box-shadow`-like glow and pulse animation (`Math.sin(Date.now() / 300) * 3` for offset)
- Text bubble: rounded rect with white text, centered or positioned per the `position` field
- Text: `drawText()` with `size: 18, color: '#ffffff'`, outline enabled for contrast

### Persistence

```javascript
// In GameState:
this.tutorialSeen = false;
this.tutorialStep = 0;

// In morning routine, before anything else:
if (!state.tutorialSeen) {
  // Run tutorial state machine instead of normal game state machine
  // Each click advances tutorialStep
  // On last step click, set tutorialSeen = true and proceed to normal game
}
```

### Checks

- [ ] New game (clear localStorage): tutorial fires immediately on first load
- [ ] Each step shows correct text + highlight around the right element
- [ ] Click anywhere advances to next step
- [ ] After step 9, tutorial ends and normal gameplay begins
- [ ] Refresh browser: tutorial does NOT fire again (flag persists)
- [ ] Tutorial text is crisp and readable (white on dark, size 18, outline)

### Gate

All 6 checks pass. Tutorial covers all core mechanics. Takes ~30 seconds to click through on first play. Veteran players never see it (flag persists).

---

## Step 6: Weekly Wrap-Up Screen

### What to Build

A summary screen that appears every 7 days after paying bills.

### Data Tracking

```javascript
// In GameState constructor:
this.weekStats = {
  startingCash: 200,
  gigsDone: 0,
  bestChoice: '',
  totalEarned: 0,
  daysWithEvents: 0
};

// Track in game loop:
// - After each gig completes: weekStats.gigsDone++, weekStats.totalEarned += gig.payout
// - After each event: if event has effect, weekStats.daysWithEvents++
```

### Display (full-screen overlay)

```
┌─────────────────────────────────────────┐
│                                         │
│          Week 1 Wrap-Up                 │  ← size 28, #ffd700
│                                         │
│    "A solid week. You earned            │  ← size 18, #e0e0e0
│     $340 after expenses."               │
│                                         │
│    ┌──────────────────────────┐         │
│    │  Gigs Completed    12    │         │  ← size 16, grid layout
│    │  Total Earned     $580   │         │
│    │  Reputation       2.4⭐ │         │
│    │  Days Survived     7    │         │
│    └──────────────────────────┘         │
│                                         │
│              [ Continue ]               │  ← standard button
│                                         │
└─────────────────────────────────────────┘
```

### Headline Logic

```javascript
function wrapUpHeadline(state, earned) {
  if (earned > 300) return `A great week. You earned $${earned} after expenses.`;
  if (earned > 0)   return `A solid week. You earned $${earned} after expenses.`;
  if (earned > -100) return `A tight week. You're down $${Math.abs(earned)}.`;
  return `A rough week. You're down $${Math.abs(earned)}. Keep pushing.`;
}
```

### Reset

After clicking "Continue", reset `state.weekStats` with current cash as the new `startingCash`.

### Checks

- [ ] Reach day 7 — wrap-up screen appears
- [ ] Stats shown match actual gameplay (earnings, gig count, rep)
- [ ] Headline is positive when earning, negative when losing money
- [ ] Headline shows correct dollar amounts
- [ ] "Continue" button works and resets week stats
- [ ] Week 2 wrap-up is independent of week 1 (fresh starting cash)

### Gate

All 6 checks pass. Wrap-up takes < 5 seconds to read. Provides a sense of progression.

---

## Master Checklist

Run this after all 6 steps + step 0 are complete and passing.

### Text Readability (Critical — Fail = Blocking)

- [ ] Zero raw `ctx.fillText()` or `ctx.font =` calls in `src/ui/` or `src/game/`
- [ ] Minimum body text size: 16px
- [ ] All body text has shadow (`rgba(0,0,0,0.8)`) or outline for contrast
- [ ] HUD text uses monospace font for readability
- [ ] Tutorial text is white on `rgba(0,0,0,0.7)` overlay (max contrast)
- [ ] Flavor ticker text is light gray (`#aaaaaa`) — readable but not competing with UI

### Gameplay Balance

- [ ] Events fire 0-2 per day (never 3+)
- [ ] Crisis events are weight 1 (rare, not common)
- [ ] Crisis events have choices or clear warning text
- [ ] Weather effects are visible on gig cards before accepting
- [ ] Tutorial can be permanently skipped (flag persists in localStorage)
- [ ] Weekly wrap-up headline accurately reflects performance

### Performance

- [ ] `rollDailyEvents()` runs once per morning, not every frame
- [ ] `rollWeather()` runs once per morning, not every frame
- [ ] Tutorial overlay adds no render overhead when `tutorialSeen = true`
- [ ] Flavor ticker uses a single timer, not continuous RAF spam
- [ ] `npm run dev` loads in < 3 seconds

### Look & Feel

- [ ] Weather emoji renders correctly in browser (☀️🌧️🔥❄️✨)
- [ ] Weather color is visible on dark HUD background
- [ ] Tutorial highlight pulses smoothly
- [ ] Event text scrolls naturally (fade in/out, not instant pop)
- [ ] Weekly wrap-up stats are aligned in a clean grid

### Regression

- [ ] Full loop still works: apartment → listings → accept → travel → gig → results → evening → sleep
- [ ] Bills trigger on day 7
- [ ] Game over triggers at 14 days overdue rent
- [ ] Shop purchases and applies upgrades
- [ ] Character customization persists across days
- [ ] `localStorage.removeItem('gigWorkerState')` → clean new game

### Scoring

| Result | Meaning |
|---|---|
| 25/25 | All pass. Session complete. |
| 20-24/25 | Minor issues. Fix flagged items before calling done. |
| < 20/25 | Major issues. Do not proceed. Fix all fails. |

---

## Execution Rules

### Order Is Enforced

```
Step 0 (text fix) → Step 1 (events) → Step 2 (weather) → Step 3 (health) → Step 4 (ticker) → Step 5 (tutorial) → Step 6 (wrap-up) → Master Checklist
```

### Each Step Has a Gate

After each step, run its checks. If any check fails:

```
❌ STOP. Fix the failing check. Do not move to the next step.
✅ All checks pass. Proceed to the next step.
```

This is not optional. Step 2 depends on Step 1's event system working correctly. Step 5 depends on Step 4's ticker animation code pattern.

### Reporting Format

When done, report:

```
Build complete. Master checklist: 24/25 passed.
- 1 fail: weather emoji renders as box in browser (fallback text needed)
Run npm run dev to play. Changes applied to C:\Users\Jbthi\gig-worker.
```

If all 25 pass:

```
Build complete. Master checklist: 25/25 — all pass.
Run npm run dev to play. All Oregon Trail elements implemented.
```