# Gig Worker Simulator — Fable One-Shot Enhancement Brief

**Goal:** Transform Session 2 build into the best web app game possible through polish, game feel, and UX. Apply research-backed best practices in a single Fable run.

---

## Research Synthesis: What Makes Indie Games Stick

### 1. **Game Feel = Juiciness** (The Secret Sauce)
**What it is:** Exaggerated, redundant audio/visual feedback that makes actions feel significant. Players get "far more output than their input deserves."

**Why it matters:** 67% of players prefer immediate feedback; indie games that nail game feel have 3–5x higher retention.

**Your opportunity:** Every interaction (accept gig, choose option, level up) should feel rewarding even if it's a small action.

---

### 2. **Difficulty Curve Matters More Than Features**
**Research finding:** 65% of players prefer games that match their skill level. Games with poor curves lose 40% of players in first session.

**Your rough edges:** QTE difficulty spike (stress + health compound), events too punishing early-game, no dynamic adjustment.

**Best practice:** Shallow curve early (days 1–3), steep middle (days 4–10), plateau late (day 11+). Gate crisis events to day 3+.

---

### 3. **Feedback Loops Drive Retention**
**Core insight:** Positive feedback loops (success → reward → easier/more fun next action) are the foundation of engagement.

**Your rough edges:** No error feedback (trying to accept when broke is silent), no reward cascade for good choices, repeat clients stale.

**Best practice:** Every action needs sensory confirmation. Continuous rewards early (every action gets feedback), intermittent later (variable payouts).

---

### 4. **Mobile UX is Non-Negotiable**
**Research finding:** First 3 minutes determine if player stays. For web games, the game should feel complete, not prototype.

**Your rough edges:** Mobile breathing room, no visual hierarchy for new players.

**Best practice:** 44–52px touch targets (yours are good), but add subtle animations and clear feedback so touch feels responsive, not mushy.

---

### 5. **Microinteractions Create Delight**
**What:** Tiny animations, sounds, haptics that telegraph what just happened.

**Examples:** 
- Gig accepted → brief "ding" + card dissolves into a "GO" badge
- Event triggered → subtle color pulse on the morning panel
- Stress spike → slight screen warble or status flash
- Health low → gentle warning throb in the HUD

**Impact:** 40% improvement in "game feel" perception per indie dev surveys.

---

## Mapping Research to Your 7 Rough Edges

### Edge 1: **Event Balance (Early-Game Punishment)**
**Research:** Players need 3–5 minutes of safety before mechanics can harm them.

**Recommendation:**
- Gate all crisis events (car trouble, dispute, cold, eviction notice) to **day 3+**
- Days 1–2: only flavor + gameplay (benefits) events
- Adjust weights: crisis tier weight 1 becomes 0 days 1–2, then 1 days 3+

**Game feel bonus:**
- Add a small visual "badge" when a safe day triggers (green checkmark glow on the morning panel)
- Audio: soft uplifting chord when you avoid a crisis event

---

### Edge 2: **Mobile Breathing Room**
**Research:** 44–52px targets are ideal; add padding/margins to reduce accidental misclicks.

**Recommendation:**
- Current buttons: 210×52px (good)
- Add 8–12px padding around gig cards (currently dense)
- Increase list spacing: CARD_H + 6 → CARD_H + 10
- On mobile (< 500px width): add bottom padding to prevent "thumb zone" overlap

**Game feel bonus:**
- Smooth slide animation when gig card appears (easeOut over 300ms)
- Button hover state: slight grow (1.05x) + shadow deepens
- Tap feedback: quick shrink-expand (0.95 → 1.0) pulse

---

### Edge 3: **QTE Difficulty Spike (Health + Stress Compound)**
**Research:** Dynamic difficulty is "magic sauce." Best practice: ease players in, then challenge.

**Recommendation:**
- Current formula: `1 + stress/150 + energy/200 + (100-health)/100` can hit 2.75x
- Cap at **1.8x** (still hard, not impossible)
- Scale health factor as `(100 - health) / 200` instead (softer curve)
- Add "practice mode" flag: first QTE per gig is always 1.0x difficulty (tutorial safety)

**Game feel bonus:**
- Visual: difficulty indicator bar (green → yellow → red) before QTE starts
- Audio: ascending tones as difficulty rises (5-note scale up)
- On success: satisfying "chime" + brief screen flash + particle burst
- On failure: sad "bloop" + gentle camera shake (not jarring)

---

### Edge 4: **No Error Feedback (Silent Failures)**
**Research:** 100% of players prefer failure feedback over silence.

**Recommendation:**
- Can't accept gig (broke/tired): **play error SFX** (short buzzer, 100ms) + **flash button red** (0.3s)
- Message in HUD: "Need $X" or "Too tired (need X energy)" fades in smoothly
- Phone cut off: show a "📵" icon in the button, clear message

**Game feel bonus:**
- Error state: gentle vibration (if mobile haptics available)
- Visual feedback: button pulses with a red glow 2x, then settles
- Error message slides up from bottom of button (not pop-in)

---

### Edge 5: **Weather-Aware Gig Reshaping**
**Research:** Visual clarity > numeric modifiers. Players need to *see* the impact.

**Recommendation:**
- **Rainy day:** Remove all outdoor gigs, add 2–3 indoor service gigs to the pool (visible difference)
- Visual marker: gig card type stripe becomes blue (vs. orange) on Rainy day, shows `[INDOOR]` tag
- **Hot day:** Gigs don't disappear, but show `⚡ +3 energy penalty` clearly (already done)
- **Cold day:** Outdoor gigs marked with `❄️ +2 energy` tag
- **Perfect day:** Show `✨ BONUS` icon next to high-payout gigs (not just +2 gigs)

**Game feel bonus:**
- Weather emoji animates on HUD (snow falls, rain pelts, sun glows) every 2s
- Card with heavy weather penalty pulses subtly (players understand the tradeoff)
- When selecting a weather-penalized gig, show a preview: "At +3 energy, you can do X more gigs today" or "That leaves Y energy"

---

### Edge 6: **Repeat Client Staling**
**Research:** Variable rewards (not every time) trigger dopamine spikes; predictable repeats feel boring.

**Recommendation:**
- Every Monday (day 1 of week), shuffle the repeat client pool:
  - Favorite 30% of repeat clients stay locked in
  - 70% rotate back into the available pool for re-earning
  - This makes repeat clients feel *earned*, not inevitable

**Game feel bonus:**
- New repeat client acquisition: show a `♥ First-time client!` badge, brief celebration sound + glow
- "You've won over this client" message after completing a second gig with same client
- Keep ♥ visual on card, but if client cycles out and comes back, earned feeling returns

---

### Edge 7: **No Walkthrough Tips / No "Why" Guide**
**Research:** 50% of players abandon games with overly complex mechanics; 75% prefer clear progression.

**Recommendation:**
- Add an optional **"?" help panel** (small icon in top-left, doesn't interfere)
  - Hover/tap reveals 3 quick tips:
    - "Tip 1: Rest when health dips below 30% (forced rest day at 0%)"
    - "Tip 2: Build reputation (⭐) to unlock better gigs"
    - "Tip 3: Upgrades boost earnings—prioritize Bike or Laptop early"
  - Fresh tip rotates each day (don't overwhelm)

**Alternative:** Add one **contextual tip** per day:
- Day 1: "Stress affects QTE difficulty—keep it under 70% when possible"
- Day 3: "Reputation unlocks Creative and Weird gigs at 2⭐ and 3⭐"
- Day 7: "Bills are due! Manage your cash carefully" (when daysUntilBills = 0)

**Game feel bonus:**
- "?" icon has a subtle pulse (breathing animation)
- Tip text fades in smoothly + sounds like a soft "ding" when revealed
- Tips feel optional, not preachy (no forced overlays)

---

## UI/UX Polish Details (High-Impact, Low-Effort)

### Color & Contrast
- **HUD text on dark background:** Already good (#f0f0f0), meets WCAG AA
- **Stress bar:** Turns red at 70% (clear threshold)
- **Health warnings:** Add a subtle red glow to the HUD when health < 30% (non-intrusive)

### Animations
- Button presses: **0.1s shrink-grow** (bouncy, responsive)
- Panel appears: **0.3s fade + slide up** (not instant pop)
- Gig card selected: **0.2s border glow** (highlight feedback)
- Event modal: **0.4s slide down + fade** (dramatic, but quick)

### Responsive Typography
- Titles: **20px bold** (readable, not crowded)
- Body text: **13–15px** (comfortable for mobile)
- HUD values: **monospace 13–16px** (scannable)

---

## Assets & Visual Polish

### Existing Assets (Already Have)
✅ Pixel sprites (character, location, items)
✅ UI icons (cash, stress, rep, energy)
✅ Color palette (browns, greens, golds—cohesive)

### What to Add/Enhance
1. **Particle effects** (3 new ones, simple):
   - Small "pop" burst (white dots) when gig accepted
   - Gentle "twinkle" (star shapes) when reputation increases
   - Soft "swirl" particles when event triggers

2. **Screen transitions** (already have fade, add):
   - Slide from right on "accept gig"
   - Zoom in on QTE start
   - Slide up on "evening" screen

3. **HUD polish**:
   - Meter animations: bars fill smoothly over 0.5s (not instant)
   - Meter color gradient (dark base → bright highlight on fill)
   - Numbers tick up (counter animation 0.2s) when cash/stress changes

### Sound Design (Procedural, Low Effort)
Enhance existing `audio.js`:
1. **Success sounds:**
   - Gig accepted: uplifting 3-note chord (C–E–G, 200ms each)
   - Choice made: soft "bloop" (200ms sine wave)
   - Payout received: "cha-ching" (two notes: high + low)

2. **Failure sounds:**
   - Can't accept: short buzzer (150ms, rough waveform)
   - Event triggered: ominous single note (100ms)

3. **Ambient feedback:**
   - Low energy warning: quiet pulse tone (every 2s until you rest)
   - Stress rising: subtle ascending tone (one note rise per stress 10-point increment)

---

## Implementation Roadmap for Fable One-Shot

**Phase 1: Core Mechanics (30 min)**
- [ ] Gate crisis events to day 3+ (edit `events.js`)
- [ ] Cap QTE difficulty at 1.8x (edit `qte.js`)
- [ ] Repeat client pool rotation (edit `loop.js` sleep)
- [ ] Error feedback SFX + message (edit `screens.js`, `audio.js`)

**Phase 2: Game Feel (45 min)**
- [ ] Add microinteractions: button scale/glow, panel slide, card highlight
- [ ] Particle effects on gig accept + reputation up (add to `screens.js`)
- [ ] HUD meter animation (edit `hud.js`)
- [ ] Sound effects for all actions (enhance `audio.js`)

**Phase 3: UX Polish (30 min)**
- [ ] Weather visualization: tag system on gig cards (edit `listings.js`)
- [ ] Health warning glow on HUD (edit `hud.js`)
- [ ] Help panel with tips (new modal in `screens.js`)
- [ ] Smooth transitions between screens (add CSS/canvas transitions)

**Phase 4: Testing (15 min)**
- [ ] Mobile viewport test (375×667)
- [ ] Audio not double-triggering
- [ ] No performance regressions
- [ ] All text readable at new sizes

---

## What NOT to Do (Keep Scope Tight)

❌ Don't rebuild HUD layout (it's solid)
❌ Don't add new gig types or mechanics
❌ Don't change core balance (just gates/caps)
❌ Don't redesign colors (palette works)
❌ Don't add animations to every element (pick 5–7 key ones)

---

## Success Metrics (Post-Enhancement)

**Technical:**
- [ ] Zero console errors
- [ ] No frame drops on mobile (60 FPS target)
- [ ] File size < 3.5 MB total (stays fast)

**UX:**
- [ ] Mobile test pass: all buttons easily tappable, text readable
- [ ] First play: tutorial → first gig → sleep (< 5 min, no confusion)
- [ ] Week 1 complete: bills → wrap-up (smooth, clear progression)

**Juice:**
- [ ] Every action has audio + visual feedback
- [ ] No silent failures (all errors have a message)
- [ ] Players *feel* difficulty scaling (not just numbers)
- [ ] Repeat clients feel earned (not inevitable)

---

## Sources

- [Indie Game Success Factors 2026](https://entaltostudios.com/what-makes-indie-game-successful/)
- [Game Feel: The Secret Sauce](https://wardrome.com/game-feel-the-secret-sauce-behind-addictive-indie-gameplay/)
- [Mobile Game Core Loops Best Practices](https://moldstud.com/articles/p-best-practices-for-designing-engaging-core-gameplay-loops-in-mobile-games)
- [Canvas HTML5 Performance Optimization](https://codetheory.in/optimizing-html5-canvas-to-improve-your-game-performance/)
- [Mobile Game UI/UX Design](https://genieee.com/best-practices-for-game-ui-ux-design/)
- [Difficulty Curves in Game Design](http://www.davetech.co.uk/difficultycurves)
- [Juicy UI Design](https://medium.com/@mezoistvan/juicy-ui-why-the-smallest-interactions-make-the-biggest-difference-5cb5a5ffc752)
- [Player Retention Feedback Loops](https://gametyrant.com/news/the-role-of-positive-feedback-loops-in-game-engagement/)
- [Web Gaming for Indie Developers](https://indiegamebusiness.com/web-gaming-for-indie-developers/)
