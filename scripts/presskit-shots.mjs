// Press kit screenshots, repeatable (2026-11-10). The first set was captured by hand and went
// stale the day the look changed. Run against a built preview:
//
//   npm run build && npx vite preview --port 4174 --strictPort   (in one terminal)
//   node scripts/presskit-shots.mjs                                (in another)
//
// Writes public/presskit/shots/<name>.jpg at 1600x1200, the canvas only. Every state is reached
// through the game's own API (window.__game), stepping its clock, so a shot never depends on how
// fast this machine draws.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SHOTS_URL || 'http://localhost:4174/';
const OUT = 'public/presskit/shots';
mkdirSync(OUT, { recursive: true });

const SAVE = { tutorialSeen: true, characterCreated: true, day: 9, cash: 340, stress: 35, energy: 85, reputation: 3.5, daysUntilBills: 7, monthType: 'steady', twist: 'appBoom', sideGoal: 'savings',
  character: { body: 0, pronouns: 'they', hairStyle: 4, facialHair: 0, skin: '#a07e56', hair: '#4a3728', shirt: '#3498db' },
  mastery: { movingHelp: 5, tutoring: 2 } };

const JOBS = [
  ['rushShift', 'Delivery Driver — Rush Shift', 'RUSH!', 'rush-shift', 2.5],
  ['marketDay', 'Flea Market Stall — Weekend', 'MARKET!', 'flea-market', 0.6],
  ['dogWalking', 'Dog Walking — Energetic Husky', 'UNTANGLE!', 'untangle', 0.6],
  ['furnitureAssembly', 'Assemble IKEA Furniture', 'ASSEMBLE!', 'assemble', 0.6],
  ['garageClean', 'Clean Out Garage', 'PACK!', 'pack-the-car', 0.6],
  ['yardWork', 'Yard Work — Leaves & Mowing', 'RAKE!', 'rake', 1.2],
  ['photoGig', 'Photography — Product Shots', 'FRAME!', 'frame', 0.6],
  ['creativeGig', 'Logo Design — Small Business', 'PROOFREAD!', 'proofread', 0.6],
  ['mysteryShop', 'Mystery Shopping — Review Store', 'SORT!', 'sort-returns', 0.6],
  ['movingHelp', 'Help Move Furniture', 'LIFT!', 'lift', 0.8],
  ['tutoring', 'Tutoring — High School Math', 'PERCENT!', 'percent', 0.6],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('pageerror', e.message));

async function fresh(save = SAVE) {
  await page.addInitScript((sv) => { try { localStorage.clear(); localStorage.setItem('gigWorkerState', JSON.stringify(sv)); } catch { /* ignore */ } }, save);
  await page.goto(URL);
  await page.waitForFunction(() => window.__booted === true, null, { timeout: 30000 });
  await page.evaluate(() => { const g = window.__game; g.resumePrompt = false; window.__loopPaused = true; g.step(4 / 60); });
}

const step = (s) => page.evaluate((sec) => { const g = window.__game; for (let i = 0; i < Math.round(sec * 60); i++) g.step(1 / 60); }, s);

async function settleMorning() {
  await page.evaluate(() => {
    const g = window.__game; let guard = 0;
    while (!g.morningReady && guard++ < 30) {
      if (g.ticker.idx < g.ticker.lines.length) g.ticker.idx += 1;
      else if (g.activeEvent && g.activeEvent.choices) g.chooseEventOption(g.activeEvent.choices.find((o) => !(o.disabled && o.disabled(g.state))));
      else g.startNextEvent();
    }
    g.message = '';
  });
  await step(0.5);
}

async function shot(name) {
  await step(2 / 60);
  await page.locator('canvas').screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 88 });
  console.log('shot', name);
}

/** Take a job and play its conversation forward to the named challenge, past its how-to card. */
async function toChallenge(tree, title, name) {
  const ok = await page.evaluate(([tree, title, name]) => {
    const g = window.__game, s = g.state;
    s.energy = 100; s.stress = 20; s.hoursLeft = 24; s.health = 100; s.seenMicrogames = [];
    g.settingsOpen = false; g.message = '';
    const gig = { ...s.todayGigs[0], choiceTree: tree, title, hasQTE: true, remote: false, hours: 3, payout: 30, appPick: false, surge: false, client: 'Ana', clientReliability: 5 };
    s.todayGigs.unshift(gig);
    if (!g.acceptGig(gig)) return 'could not accept: ' + g.message;
    const tick = (n = 12) => { for (let i = 0; i < n; i++) g.step(1 / 60); };
    for (let guard = 0; guard < 400; guard++) {
      tick();
      if (g.transition) continue;
      if (g.phase === 'TRAVEL') { g.travelT = 2; g.startGig(); continue; }
      if (g.phase !== 'GIG') return 'left the gig in ' + g.phase;
      if (g.pendingOutcome) { g.continueOutcome(); continue; }
      if (g.qte && g.qte.name === name) {
        if (g.qteIntroHold) { s.seenMicrogames = [...s.seenMicrogames, g.qte.introKey || g.qte.name]; g.qteIntroHold = false; g.qteReadyT = 99; }
        if (g.qteReadyT < 2) { g.qteReadyT = 99; }
        return 'ok';
      }
      if (g.qte && g.qteKind === 'ei' && !g.qte.done) { g.finishEIGame({ success: true, score: 80, effects: {}, summary: 'You read them well.' }); continue; }
      if (g.node && !g.qte) { g.choose(g.node.choices[0]); continue; }
      if (!g.node && !g.qte) g.afterChoices();
    }
    return 'never reached ' + name + ' (at ' + (g.qte ? g.qte.name : 'no challenge') + ')';
  }, [tree, title, name]);
  if (ok !== 'ok') console.log('PROBLEM', tree, ok);
  return ok === 'ok';
}

// ---- the apartment and the board ----
await fresh();
await settleMorning();
await shot('morning');
await page.evaluate(() => { const g = window.__game; g.goBrowse(); });
await step(1);
await page.evaluate(() => { const g = window.__game; const gigs = g.state.todayGigs; const pick = gigs.find((x) => x.appPick) || gigs[0]; g.selectedGig = pick; g.message = '';
  // keep the app's pick on screen with the specialist job and the surge above it where possible
  g.listScroll = Math.max(0, Math.min(gigs.indexOf(pick) - 3, gigs.length - 5)); });
await shot('job-board');

// ---- every job challenge, mid-play ----
for (const [tree, title, name, file, wait] of JOBS) {
  await fresh();
  await settleMorning();
  if (await toChallenge(tree, title, name)) { await step(wait); await shot(file); }
}

// ---- the two people-skills games ----
for (const [minigame, file] of [['readclient', 'read-the-client'], ['textback', 'text-back']]) {
  await fresh();
  await settleMorning();
  await page.evaluate((minigame) => {
    const g = window.__game, s = g.state;
    g.currentGig = { ...s.todayGigs[0], title: 'Assemble IKEA Furniture', type: 'service', choiceTree: 'furnitureAssembly', hasQTE: true, remote: true };
    g.snapshot = { cash: s.cash, stress: s.stress, rep: s.reputation, energy: s.energy }; g.outcomeTexts = [];
    g.phase = 'GIG'; g.enterNode({ minigame, next: 'work' });
  }, minigame);
  await step(1.6);
  await shot(file);
}

// ---- new this round: the month choice, a surprise cost, the summary, what the app paid ----
await fresh({ tutorialSeen: true, characterCreated: false, monthType: 'tight' });
await step(0.5);
await shot('choose-your-month');

await fresh({ ...SAVE, monthType: 'tight', day: 3, cash: 300, daysUntilBills: 4, twist: 'rainySeason' });
await page.evaluate(() => { const g = window.__game; g.phase = 'EVENING'; g.ping = null; g.state.eveningDoneDay = g.state.day; g.sleep(); });
await step(2);
await page.evaluate(() => {
  const g = window.__game; let guard = 0;
  while (!(g.activeEvent && g.activeEvent.surprise) && guard++ < 30) {
    if (g.ticker.idx < g.ticker.lines.length) g.ticker.idx += 1;
    else if (g.activeEvent && g.activeEvent.choices) g.chooseEventOption(g.activeEvent.choices[g.activeEvent.choices.length - 1]);
    else g.startNextEvent();
  }
});
await step(0.6);
await shot('surprise-cost');

const END = { ...SAVE, day: 30, cash: 912, totalEarned: 3460, gigsCompleted: 41, reputation: 4, health: 72, eveningsRested: 9, eiWins: 7, eveningDoneDay: 30, mastery: { movingHelp: 7, tutoring: 3, dogWalking: 2 },
  app: { streak: 0, lastPickDay: 0, missed: 0, priorityDrop: false, questPaidWeek: 0, bonus: 70, streaksHit: 1, questsHit: 1, questsMissed: 2, pickJobs: 6, pickHours: 22, pickPay: 310, otherHours: 64, otherPay: 2890, surgeJobs: 3, dropDays: 4 } };
await fresh(END);
await page.evaluate(() => { const g = window.__game; g.phase = 'EVENING'; g.ping = null; g.billsOpen = false; g.wrapUpOpen = false; g.sleep(); });
await step(2);
await shot('month-summary');
await page.evaluate(() => { const g = window.__game; g.mathOpen = true; g.mathPage = 4; });
await step(0.3);
await shot('what-the-app-paid');

await browser.close();
