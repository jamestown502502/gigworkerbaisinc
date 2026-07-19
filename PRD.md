# Gig Worker Simulator — Game Design Document

## Core Concept
A mobile-first browser game where players live the day-to-day reality of a gig worker piecing together income from short-term local jobs. Browse listings, accept gigs, complete choice-tree scenarios and quick-time events, manage cash/stress/reputation/energy, and survive the month.

## Genre & Vibe
- **Genre:** Life-sim / Strategy hybrid (menu-driven with pixel character)
- **Art style:** Cozy pixel art, warm colors, Craigslist-meets-apartment-living aesthetic
- **Palette:** Warm earth tones (#8B4513, #D2B48C, #F5DEB3) with accent colors per gig type
- **Audio:** Procedural Web Audio — lo-fi beats for apartment, tense tones for gigs

## Core Loop
1. **Morning** — Wake up in apartment, view character, check stats
2. **Browse** — Scroll a Craigslist-style listing board with ~6 gigs per day
3. **Evaluate** — Each gig shows payout, time, location, risk level, skill required
4. **Accept** — Choose gigs to fill your day (juggling start times and locations)
5. **Travel** — Click to travel (costs energy, shows pixel character moving on map)
6. **Gig** — Complete a choice-tree scenario AND/OR a quick-time event mini-game
7. **Collect** — Get paid (or scammed, or short-changed based on choice outcomes)
8. **Evening** — Return to apartment, pay bills, buy food, upgrade gear
9. **Repeat** — New day, new listings, meters change based on previous choices

## The 4 Meters

| Meter | Range | What Affects It | What It Affects |
|---|---|---|---|
| **Cash** | $0–$10,000 | Gig payouts, bills, food, upgrades | Can you pay rent? Buy gear? |
| **Stress** | 0–100 | Bad gigs, scams, tight deadlines, skipped meals | High stress = QTE harder, bad choices more likely |
| **Reputation** | 0–5 stars | Gig completion, client ratings, cancellations | Better gigs unlock at higher rep |
| **Energy** | 0–100 | Travel, hard gigs, skipped sleep | Low energy = fewer gigs per day, choices limited |

## Gig Template System
Each gig is procedurally generated from a template:

```javascript
{
  title: "Help Move Furniture — Uptown",
  type: "physical" | "creative" | "service" | "weird",
  payout: 40–200,       // dollars
  duration: 1–4,         // hours
  location: "safe" | "okay" | "sketchy",
  risk: 0–40,            // scam probability %
  skillReq: "none" | "strength" | "tech" | "social",
  clientReliability: 1–5,
  description: "...",
  choiceTree: "movingHelp" | "dogWalking" | "yardWork" | "creativeGig" | "weirdGig",
  hasQTE: true/false
}
```

### Gig Types (Procedural — Mix of Normal & Weird)

| Type | Examples | Choice Tree Theme | QTE? |
|---|---|---|---|
| **Physical** | Moving furniture, yard work, cleaning | Client tries to renegotiate, unsafe equipment | ✅ Tap/rhythm mini-game |
| **Creative** | Logo design, photography, writing | Scope creep, "I'll pay you exposure" | ❌ Pure choice tree |
| **Service** | Dog walking, tutoring, assembling furniture | Pet escapes, client not home, hidden damage | ✅ Timed buttons |
| **Weird** | Water slide tester, professional cuddler, mattress sleeper | Boundary testing, "is this a scam?" | ⚠️ Unpredictable |

### The Choice Trees
Every gig has a 3-5 node branching narrative. Examples:

**Moving Help — Choice Tree:**
```
Client shows you a truck packed floor-to-ceiling.
→ [Accept the overload] +$20 bonus, -15 energy, +10 stress
→ [Refuse, offer to do 2 trips] No bonus, -5 energy, clientReliability drops
→ [Suggest charging hourly instead] +$30 if they agree, 40% chance they fire you
```

**Weird Gig (Water Slide Tester):**
```
You arrive at the water park. The slide is 8 stories tall. The client hands you a clipboard and a stopwatch.
→ [Just ride it — go with the flow] Fun +5 energy, payout as agreed
→ [Ask detailed safety questions] +5 rep, client appreciates thoroughness
→ [Request a second ride for "accuracy"] 30% chance client says no, 70% extra $20
→ [Film it for your channel] +10 rep if good footage, -5 if it looks goofy
```

**Professional Cuddler:**
```
The client is a nervous elderly person in a tidy but lonely apartment. They offer tea.
→ [Set clear boundaries first] Trust established, +5 rep, smooth session
→ [Just chat for the hour, skip cuddling] Same pay, less emotionally draining
→ [Try to upsell additional services] 60% chance client feels pressured, cancels
```

### Quick-Time Events
For physical and service gigs, a QTE mini-game fires:

- **Rhythm Tap** — Circles converge on a target. Tap when aligned. Speed increases with stress level.
- **Timed Sequence** — Buttons flash on screen. Press them in order before timer runs out.
- **Steady Hand** — Keep a needle/marker within a moving zone. Drift = noise = failure.

QTE difficulty scales with: stress level (high stress = harder), energy level (low energy = slower reactions), and gig difficulty.

## Progression

| Reputation | Unlocks | Cash Flow |
|---|---|---|
| 0–1 ★ | Basic gigs only (physical, service) | $40–80/gig |
| 2 ★ | Creative gigs appear | $60–120/gig |
| 3 ★ | Weird gigs appear, repeat clients start | $80–160/gig |
| 4 ★ | Premium gigs, client tips appear | $120–200/gig |
| 5 ★ | "Regular" status — clients request you directly | $150–250/gig |

### Upgrades (Buy with Cash)

| Item | Cost | Effect |
|---|---|---|
| Better shoes | $50 | -2 energy per travel |
| Tool belt | $80 | Unlocks higher-paying physical gigs |
| Laptop | $200 | Unlocks remote creative gigs, no travel cost |
| Bike | $120 | Travel costs 1 energy instead of 3 |
| Car | $800 | Travel costs 0 energy, unlocks suburban gigs |
| Phone upgrade | $60 | See client reliability rating before accepting |
| Work gloves | $30 | +5 energy when doing physical gigs |
| First aid kit | $40 | Reduce stress by 10 after a bad gig |

### Bills (Due Every 7 Days)

| Bill | Amount | Missed Payment Penalty |
|---|---|---|
| Rent | $600 | Eviction warning → game over if unpaid 14 days |
| Phone | $40 | Can't see listings until paid |
| Food | $50–100/week | Energy drains 2x faster |
| Transport | $20–60/week | Variable (gas, bus pass) |

## Controls
- **Desktop:** Click on listings, buttons for choices, space/click for QTE
- **Mobile:** Tap listings, tap choices, tap for QTE

## Technical Constraints
- Pure HTML5/Canvas/JavaScript — no backend, no database
- Vite project structure (index.html + src/engine/ + src/game/ + src/ui/ + src/assets/)
- All data in localStorage (player state, day counter, gig history)
- Procedural gig generation from templates — no hardcoded gigs
- Choice trees as JSON data — easy to add more
- Pixel character with simple customization (skin tone, hair color, shirt color — stored in localStorage)
- High-DPI canvas adapter for mobile screens
- InputManager with touch support for QTE on mobile
- ALL files lowercase (Android case-sensitivity safety)

## What NOT to Build (MVP Scope)
- No real payment or IAP — cosmetic upgrades only
- No online leaderboard or multiplayer
- No animations beyond simple sprite swaps
- No sound effects beyond procedural Web Audio
- No complex map — travel is a screen transition with text
- No character clothing options beyond color swaps (for now)

## Folder Structure
```
gig-worker/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js              # Bootstrap
│   ├── engine/
│   │   ├── canvas.js        # High-DPI adapter
│   │   ├── input.js         # Universal input (click + touch)
│   │   ├── audio.js         # Procedural audio
│   │   └── state.js         # Game state + localStorage
│   ├── game/
│   │   ├── loop.js          # State machine (MORNING → BROWSE → GIG → EVENING)
│   │   ├── gigs.js          # Gig generation from templates
│   │   ├── choices.js       # Choice tree data + engine
│   │   └── qte.js           # Quick-time event mini-games
│   ├── ui/
│   │   ├── screens.js       # Screen renderers (apartment, listings, gig, results)
│   │   ├── hud.js           # Top bar: cash, stress, rep, energy + day counter
│   │   ├── character.js     # Pixel character renderer + customization
│   │   └── listings.js      # Listing board renderer
│   └── assets/
│       ├── manifest.js      # ASSET_MANIFEST config
│       └── media/           # Pre-generated PNG sprites
```

## Assets Provided
See `src/assets/media/` for pre-generated sprites from FLUX:
- `character.png` — Pixel character base (32x64)
- `apartment.png` — Apartment view background (800x600)
- `listings-board.png` — Craigslist board background (800x600)
- `work-location.png` — Generic gig location background (800x600)
- `ui-icons.png` — 4 icon strip for cash/stress/reputation/energy (32x32 each)
- `items.png` — Tool/item icon strip (32x32 each)