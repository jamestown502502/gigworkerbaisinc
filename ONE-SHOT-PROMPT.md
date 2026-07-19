# Claude Code — Build Gig Worker Simulator

## Instructions
Build the complete game described in PRD.md using the provided assets in `src/assets/media/`. This is a browser-based life-sim/strategy hybrid where players browse a Craigslist-style listing board, accept gigs, complete choice-tree scenarios and quick-time events, and manage cash/stress/reputation/energy.

## Before You Build
Confirm you understand all 8 elements below. Then ask "Shall I proceed?" before writing code.

---

## 1. Project Structure — Vite Scaffold

Create this exact structure:

```
gig-worker/
├── index.html                # <div id="game"> + <script type="module" src="/src/main.js">
├── package.json              # vite dev dependency
├── vite.config.js
src/
├── main.js                   # Bootstrap: canvas init → InputManager → state.load() → game loop
├── engine/
│   ├── canvas.js             # setupGameCanvas() — High-DPI adapter (see below)
│   ├── input.js              # InputManager — click + touch unified
│   ├── audio.js              # Procedural Web Audio functions
│   └── state.js              # GameState class with localStorage persistence
├── game/
│   ├── loop.js               # State machine: MORNING → BROWSE → TRAVEL → GIG → EVENING
│   ├── gigs.js               # Gig generation from templates (procedural, ~6 per day)
│   ├── choices.js            # Choice tree data + engine (branching narratives)
│   └── qte.js                # 3 QTE mini-games: rhythm tap, timed sequence, steady hand
├── ui/
│   ├── screens.js            # Screen renderers: apartment(), listings(), gig(), results(), shop()
│   ├── hud.js                # Top bar: cash/stress/rep/energy meters + day counter
│   ├── character.js          # Pixel character renderer with color customization
│   └── listings.js           # Listing board with scrolling, gig cards, accept button
└── assets/
    ├── manifest.js           # ASSET_MANIFEST (provided — use as-is)
    └── media/                # Pre-generated PNG sprites (provided — do NOT regenerate)
```

## 2. Required Code Patterns (Copy These)

### 2a. High-DPI Canvas — `src/engine/canvas.js`

```javascript
export function setupGameCanvas(canvas, logicalWidth = 800, logicalHeight = 600, isPixelArt = true) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = logicalWidth * dpr;
  canvas.height = logicalHeight * dpr;
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  ctx.scale(dpr, dpr);
  if (isPixelArt) { ctx.imageSmoothingEnabled = false; canvas.style.imageRendering = 'pixelated'; }
  return ctx;
}
```

### 2b. Unified Input — `src/engine/input.js`

```javascript
export const InputManager = {
  isMobile: /Android|iPhone|iPad/i.test(navigator.userAgent),
  clicks: [],  // { x, y, type: 'click'|'touch' }
  init(canvas) {
    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.clicks.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, type: 'click' });
    });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const touch = e.touches[0];
      this.clicks.push({ x: touch.clientX - rect.left, y: touch.clientY - rect.top, type: 'touch' });
    }, { passive: false });
  },
  consumeClick() { return this.clicks.shift() || null; },
  clearClicks() { this.clicks = []; }
};
```

### 2c. Game State — `src/engine/state.js`

```javascript
export class GameState {
  constructor() {
    this.cash = 200;
    this.stress = 20;
    this.reputation = 1;  // 0-5 stars (fractional)
    this.energy = 80;
    this.day = 1;
    this.daysUntilBills = 7;
    this.character = { skin: '#d4a574', hair: '#4a3728', shirt: '#3498db' };
    this.inventory = [];
    this.gigHistory = [];
    this.repeatClients = [];
    this.load();
  }
  save() { localStorage.setItem('gigWorkerState', JSON.stringify(this)); }
  load() {
    const saved = localStorage.getItem('gigWorkerState');
    if (saved) Object.assign(this, JSON.parse(saved));
  }
  reset() {
    localStorage.removeItem('gigWorkerState');
    Object.assign(this, new GameState());
  }
}
```

### 2d. Asset Loader — Place in `src/main.js`

```javascript
const imageCache = {};
const USE_FILE_ASSETS = true;

async function loadAssets() {
  const promises = [];
  for (const [key, path] of Object.entries(ASSET_MANIFEST.files)) {
    promises.push(new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { imageCache[key] = img; resolve(); };
      img.onerror = () => { console.warn(`Failed: ${path}`); resolve(); };
      img.src = path;
    }));
  }
  await Promise.all(promises);
}

function drawSprite(ctx, key, x, y, w, h, frame = 0) {
  const asset = ASSET_MANIFEST[key];
  if (imageCache[key]) {
    const sx = frame * (asset.frameWidth || w);
    ctx.drawImage(imageCache[key], sx, 0, (asset.frameWidth || w), h, x, y, w, h);
  } else if (asset?.procedural) {
    asset.procedural(ctx, x, y, w, h);
  }
}
```

## 3. Game Logic

### 3a. State Machine (`src/game/loop.js`)

```
MORNING → animate sleep recovery, show stats, button to "Check Listings"
BROWSE  → show 6 procedurally generated gigs, click to select + accept
TRAVEL  → show character moving, deduct energy, button to "Start Gig"
GIG     → show choice tree nodes OR trigger QTE, resolve outcome
EVENING → show results, pay rent/bills if due, shop for upgrades, "Sleep" button
```

### 3b. Gig Generation (`src/game/gigs.js`)

Generate 6 gigs each morning from templates:

```javascript
const GIG_TEMPLATES = [
  { title: 'Help Move Furniture', type: 'physical', payout: [60, 120], hours: [2, 4], risk: [10, 30], location: 'okay', skillReq: 'strength', hasQTE: true, choiceTree: 'movingHelp' },
  { title: 'Yard Work — Leaves & Mowing', type: 'physical', payout: [40, 80], hours: [2, 3], risk: [5, 15], location: 'safe', skillReq: 'none', hasQTE: false, choiceTree: 'yardWork' },
  { title: 'Dog Walking — Energetic Husky', type: 'service', payout: [25, 50], hours: [1, 2], risk: [5, 20], location: 'safe', skillReq: 'none', hasQTE: true, choiceTree: 'dogWalking' },
  { title: 'Assemble IKEA Furniture', type: 'service', payout: [50, 100], hours: [2, 4], risk: [5, 10], location: 'okay', skillReq: 'tech', hasQTE: false, choiceTree: 'furnitureAssembly' },
  { title: 'Logo Design — Small Business', type: 'creative', payout: [80, 150], hours: [3, 5], risk: [15, 30], location: 'safe', skillReq: 'tech', hasQTE: false, choiceTree: 'creativeGig' },
  { title: 'Photography — Product Shots', type: 'creative', payout: [60, 120], hours: [2, 4], risk: [10, 25], location: 'okay', skillReq: 'tech', hasQTE: false, choiceTree: 'photoGig' },
  { title: 'Water Slide Tester', type: 'weird', payout: [80, 150], hours: [1, 3], risk: [5, 15], location: 'safe', skillReq: 'none', hasQTE: false, choiceTree: 'waterSlide' },
  { title: 'Professional Cuddler', type: 'weird', payout: [60, 80], hours: [1, 2], risk: [20, 40], location: 'okay', skillReq: 'social', hasQTE: false, choiceTree: 'cuddler' },
  { title: 'Mattress Tester — Hotel Review', type: 'weird', payout: [50, 100], hours: [6, 8], risk: [5, 10], location: 'safe', skillReq: 'none', hasQTE: false, choiceTree: 'mattressTest' },
  { title: 'Clean Out Garage', type: 'physical', payout: [50, 90], hours: [3, 4], risk: [10, 20], location: 'okay', skillReq: 'strength', hasQTE: true, choiceTree: 'garageClean' },
  { title: 'Tutoring — High School Math', type: 'service', payout: [30, 60], hours: [1, 2], risk: [5, 10], location: 'safe', skillReq: 'social', hasQTE: false, choiceTree: 'tutoring' },
  { title: 'Mystery Shopping — Review Store', type: 'weird', payout: [40, 70], hours: [1, 2], risk: [5, 15], location: 'okay', skillReq: 'none', hasQTE: false, choiceTree: 'mysteryShop' },
];
```

Each day, randomly select 6, randomize payout/hours/risk within ranges, add location-based flavor text.

### 3c. Choice Trees (`src/game/choices.js`)

Each choice tree has 2-3 nodes. Example structure:

```javascript
const CHOICE_TREES = {
  movingHelp: [
    { text: 'Client shows a truck packed floor-to-ceiling.', choices: [
      { text: 'Accept the overload', result: { cash: 20, energy: -15, stress: 10, rep: 0 }, next: null },
      { text: 'Offer to do 2 trips instead', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null },
      { text: 'Suggest hourly rate instead', result: { cash: 30, energy: -10, stress: 5, rep: 0.1, chance: 0.6 }, next: null },
    ]},
  ],
  waterSlide: [
    { text: 'The water slide towers 8 stories above the park. Clipboard in hand, you have options.', choices: [
      { text: 'Just ride it — go with the flow', result: { cash: 0, energy: 5, stress: -5, rep: 0 }, next: null },
      { text: 'Ask detailed safety questions', result: { cash: 0, energy: 0, stress: 0, rep: 0.3 }, next: 'safetyFollowUp' },
      { text: 'Request a second ride for "accuracy"', result: { cash: 20, energy: 0, stress: 0, rep: 0, chance: 0.7 }, next: null },
      { text: 'Film it for your channel', result: { cash: 0, energy: 0, stress: 5, rep: 0.2, chance: 0.7, failResult: { rep: -0.2 } }, next: null },
    ]},
  ],
  cuddler: [
    { text: 'A nervous elderly client offers tea. The apartment is tidy but lonely.', choices: [
      { text: 'Set clear boundaries and guidelines first', result: { cash: 0, energy: 0, stress: -5, rep: 0.3 }, next: null },
      { text: 'Just chat for the hour', result: { cash: 0, energy: 5, stress: -10, rep: 0.1 }, next: null },
      { text: 'Try to upsell additional services', result: { cash: 0, energy: 0, stress: 10, rep: 0, chance: 0.4, failResult: { cash: 0, rep: -0.5 } }, next: null },
    ]},
  ],
  // ... add at least 6 more for the MVP
};
```

### 3d. Quick-Time Events (`src/game/qte.js`)

3 types:

```javascript
// TYPE 1: Rhythm Tap — circles converge, tap when aligned
// TYPE 2: Timed Sequence — buttons appear, press in order before timer
// TYPE 3: Steady Hand — keep marker in a moving zone

// Each returns { success: bool, score: 0-100 }
// Difficulty scales with: stress level (high = harder) and energy (low = harder)
```

## 4. Screen Renderers (`src/ui/screens.js`)

Each screen is a function `renderScreen(ctx, state, assets)` that draws to the canvas:

- **apartmentScreen** — Draw apartment background, character sprite (customized), stats summary, "Check Listings" button, "Shop" button, "Sleep" button
- **listingsScreen** — Draw listings board background, 6 gig cards (scrollable), each shows title, payout, hours, risk, location. Click to select, "Accept" button
- **travelScreen** — Simple transition: "Traveling to [gig title]..." progress bar, deduct energy, "Start Gig" button
- **gigScreen** — Show choice tree text + buttons OR launch QTE overlay. Based on gig type, randomly pick choice tree or QTE (or both in sequence)
- **resultsScreen** — Show payout, stat changes, gig story text, "Continue" button
- **eveningScreen** — Show day summary, bill reminders, shop UI (list of upgrades with prices), "Sleep" button to advance day
- **gameOverScreen** — Show final stats, "Start New Game" button

## 5. Character Customization

In the apartment screen, allow changing:
- Skin color (click to cycle through 4 options)
- Hair color (cycle through 4 options)
- Shirt color (cycle through 6 options)

Draw the character with color overrides:

```javascript
function drawCharacter(ctx, x, y, w, h, colors) {
  // Draw pixel character body shape
  // Use colors.skin for face/hands
  // colors.hair for hair
  // colors.shirt for torso
  // This is the procedural fallback — will also be used to recolor the sprite
}
```

## 6. UI Layout

```
┌─────────────────────────────────────────────────┐
│  💰 $420   ❤️ Stress 35   ⭐ Rep 1.2   ⚡ Energy 60  │  ← HUD (top bar)
│                        Day 7                       │
├─────────────────────────────────────────────────┤
│                                                   │
│                                                   │
│              GAME SCREEN CONTENT                  │
│           (changes per state)                     │
│                                                   │
│                                                   │
│                                                   │
├─────────────────────────────────────────────────┤
│           [Button 1]    [Button 2]               │  ← Action buttons
└─────────────────────────────────────────────────┘
```

## 7. Mobile Safeguards

- `setupGameCanvas()` handles devicePixelRatio
- `InputManager` handles both click and touch
- Canvas touch events use `preventDefault` (no scroll/zoom)
- ALL filenames are lowercase (Android future-proofing)
- UI buttons minimum 44x44px touch targets
- Text sized for mobile readability (minimum 16px equivalent)

## 8. Deliverable

1. After writing all files, run `npm install && npm run dev`
2. Confirm the game loads in browser with no errors
3. Confirm you can: see apartment → browse listings → accept gig → do a choice tree → see results
4. Report: "Build complete. Run `npm run dev` to play."

## Assets Provided
Files in `src/assets/media/` (DO NOT regenerate — use as-is):
- `character.png` — Pixel character base (32x64)
- `apartment.png` — Apartment view background (800x600)
- `listings-board.png` — Craigslist board background (800x600)
- `work-location.png` — Generic gig location background (800x600)
- `ui-icons.png` — Icon strip (128x32, 4 icons: cash/stress/rep/energy)
- `items.png` — Item icons strip (128x32, 4 icons)

Use `ASSET_MANIFEST` in `src/assets/manifest.js` for the adapter pattern.