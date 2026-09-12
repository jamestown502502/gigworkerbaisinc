import { test, expect } from '@playwright/test';
import { boot, settleMorning, step } from './helpers.js';

// Text-overlap sweep: every screen is rendered with the text probe on, and no two drawn
// strings on the same frame may intersect. This catches the whole class behind QA #13 / #17
// (labels drawn into buttons, hints wrapping into play areas) rather than the two instances.
function overlaps(a, b) {
  const pad = -2; // small tolerance for outline/shadow
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

async function sweep(page, label) {
  const texts = await page.evaluate(() => {
    window.__textProbe = [];
    window.__game.step(1 / 60);
    const all = window.__textProbe;
    window.__textProbe = null;
    // only the topmost layer is visible: drop everything before the last modal/overlay marker
    let cut = 0;
    all.forEach((t, i) => { if (t.layer) cut = i + 1; });
    return all.slice(cut).filter((t) => !t.layer);
  });
  const collisions = [];
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.text === b.text && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) continue; // outline pass + fill pass
    if (a.w === 0 || b.w === 0) continue;
    if (overlaps(a, b)) collisions.push(`${label}: "${a.text}" @${Math.round(a.x)},${Math.round(a.y)} vs "${b.text}" @${Math.round(b.x)},${Math.round(b.y)}`);
  }
  return collisions;
}

test('no two texts overlap on any screen', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 350, day: 8, unpaidRent: 600, rentOverdueDays: 3, phoneCut: true, unpaidPhone: 40, hungry: true, stress: 75 } });
  const problems = [];
  await page.evaluate(() => { const g = window.__game; g.ticker = { lines: ['Study finds 1 in 3 gig workers skip meals to save money.'], idx: 0, t: 1 }; g.step(1 / 60); });
  problems.push(...await sweep(page, 'morning+ticker'));
  await page.evaluate(() => { const g = window.__game; g.ticker.idx = 1; g.activeEvent = { id: 'car-trouble', tier: 2, text: "Your car won't start. The mechanic quotes $150.", choices: [{ text: 'Pay the mechanic ($150)', disabled: () => false, apply: () => '' }, { text: 'Take the bus today', apply: () => '' }] }; g.eventT = 1; g.step(1 / 60); });
  problems.push(...await sweep(page, 'event-modal'));
  await page.evaluate(() => { const g = window.__game; g.activeEvent = null; g.shopOpen = true; g.step(1 / 60); });
  problems.push(...await sweep(page, 'shop'));
  await page.evaluate(() => { const g = window.__game; g.shopOpen = false; g.settingsOpen = true; g.confirmReset = true; g.step(1 / 60); });
  problems.push(...await sweep(page, 'settings'));
  await page.evaluate(() => { const g = window.__game; g.settingsOpen = false; g.hudTooltip = 'Balance. Your overall wellbeing: hunger, stress, and late nights wear it down; rest, food, and friends build it. Low balance means slower recovery and sick days.'; g.hudTooltipT = 0.5; g.step(1 / 60); });
  problems.push(...await sweep(page, 'hud-tooltip'));
  await page.evaluate(() => { const g = window.__game; g.hudTooltip = null; g.state.tutorialSeen = false; g.state.tutorialStep = 0; g.step(1 / 60); });
  problems.push(...await sweep(page, 'tutorial-0'));
  await page.evaluate(() => { const g = window.__game; g.state.tutorialStep = 2; g.step(1 / 60); });
  problems.push(...await sweep(page, 'tutorial-2'));
  await page.evaluate(() => { const g = window.__game; g.state.tutorialSeen = true; g.state.phoneCut = false; g.goBrowse(); g.selectedGig = g.state.todayGigs[0]; g.step(1); });
  problems.push(...await sweep(page, 'listings'));
  await page.evaluate(() => {
    const g = window.__game; const s = g.state;
    g.currentGig = { ...s.todayGigs[0], title: 'Assemble IKEA Furniture', type: 'service', choiceTree: 'furnitureAssembly', hasQTE: true, remote: true };
    g.snapshot = { cash: s.cash, stress: s.stress, rep: s.reputation, energy: s.energy }; g.outcomeTexts = [];
    g.phase = 'GIG'; g.enterNode({ minigame: 'textback', next: 'work' }); g.step(1);
  });
  problems.push(...await sweep(page, 'gig-textback'));
  await page.evaluate(() => { const g = window.__game; g.qte = null; g.qteKind = null; g.enterNode({ minigame: 'readclient', next: 'work' }); g.step(1); });
  problems.push(...await sweep(page, 'gig-readclient-0'));
  await page.evaluate(() => { const g = window.__game; g.qte.picked = g.qte.s.feeling; g.qte.step = 1; g.step(1 / 60); });
  problems.push(...await sweep(page, 'gig-readclient-1'));
  for (const kind of ['physical', 'service', 'weird']) {
    await page.evaluate((k) => { const g = window.__game; g.qte = null; g.currentGig.type = k; g.afterChoices(); g.step(1); }, kind);
    problems.push(...await sweep(page, `qte-${kind}`));
  }
  await page.evaluate(() => { const g = window.__game; g.qte = null; g.node = null; g.finishGig({ success: false, score: 12 }); g.step(2); });
  problems.push(...await sweep(page, 'results'));
  await page.evaluate(() => { const g = window.__game; g.results = null; g.goEvening(); g.ping = null; g.step(1); });
  problems.push(...await sweep(page, 'evening'));
  await page.evaluate(() => { const g = window.__game; g.ping = { gig: { title: 'Early call: Help Move Furniture', payout: 140 }, resolved: false, text: '' }; g.step(1 / 60); });
  problems.push(...await sweep(page, 'evening-ping'));
  await page.evaluate(() => { const g = window.__game; g.ping = null; g.billsOpen = true; g.billsPaid = { rent: false, phone: false, food: true }; g.step(1 / 60); });
  problems.push(...await sweep(page, 'bills'));
  await page.evaluate(() => { const g = window.__game; g.billsOpen = false; g.wrapUpOpen = true; g.step(1 / 60); });
  problems.push(...await sweep(page, 'wrapup'));
  await page.evaluate(() => { const g = window.__game; g.wrapUpOpen = false; g.eveningChoice('checkin'); g.step(1); });
  problems.push(...await sweep(page, 'evening-checkin'));
  await page.evaluate(() => { const g = window.__game; g.qte = null; g.qteKind = null; g.state.eveningDoneDay = 0; g.eveningChoice('winddown'); g.step(1); });
  problems.push(...await sweep(page, 'evening-breathe'));
  await page.evaluate(() => { const g = window.__game; g.qte = null; g.qteKind = null; g.phase = 'SUMMARY'; g.step(1 / 60); });
  problems.push(...await sweep(page, 'summary'));
  await page.evaluate(() => { const g = window.__game; g.phase = 'GAMEOVER'; g.step(1 / 60); });
  problems.push(...await sweep(page, 'gameover'));
  expect(problems, problems.join('\n')).toEqual([]);
});

test('transitions finish within 0.6 s of game time and leave no hotspots dangling', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100 } });
  await settleMorning(page);
  const kinds = ['fade', 'phone', 'commute', 'doorway', 'receipt', 'dusk', 'sunrise', 'paper'];
  for (const k of kinds) {
    const r = await page.evaluate((kind) => {
      const g = window.__game;
      g.setPhase('MORNING', kind, { fromDay: 1, toDay: 2 });
      let frames = 0;
      while (g.transition && frames < 120) { g.step(1 / 60); frames += 1; }
      return { frames, transition: g.transition };
    }, k);
    expect(r.transition, k).toBeNull();
    expect(r.frames, k).toBeLessThanOrEqual(37);
  }
});
