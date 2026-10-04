// "Get stuck" audit (2026-10-05). Players reported getting stuck in minigames after the polish
// update. The other suites drive time by hand (game.step) and finish challenges by calling
// finishGig directly, so none of them ever PLAYED a challenge to its end on the game's own clock.
//
// This suite does, for every job challenge, both people-skills games and both evening games: the
// real requestAnimationFrame loop, real taps (choices, the challenge itself, the receipt's
// Continue), and checks that each one reaches its result, prints and stamps the receipt, and hands
// the player back.
import { test, expect } from '@playwright/test';
import { boot } from './helpers.js';

const JOBS = [
  ['movingHelp', 'Help Move Furniture'], ['dogWalking', 'Dog Walking — Energetic Husky'],
  ['garageClean', 'Clean Out Garage'], ['yardWork', 'Yard Work — Leaves & Mowing'],
  ['creativeGig', 'Logo Design — Small Business'], ['mysteryShop', 'Mystery Shopping — Review Store'],
  ['furnitureAssembly', 'Assemble IKEA Furniture'], ['tutoring', 'Tutoring — High School Math'],
  ['photoGig', 'Photography — Product Shots'], ['rushShift', 'Delivery Driver — Rush Shift'],
  ['marketDay', 'Flea Market Stall — Weekend'],
];

async function tap(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (x / 800) * box.width, box.y + (y / 600) * box.height);
}

const read = (page) => page.evaluate(() => {
  const g = window.__game;
  return {
    phase: g.phase, transition: !!g.transition, travelT: g.travelT, outcome: !!g.pendingOutcome,
    choices: g.node ? g.node.choices.length : 0, kind: g.qteKind, name: g.qte?.name ?? null,
    intro: !!g.qteIntroHold, done: !!g.qte?.done, stamped: !!g.receiptStamped,
    settings: !!g.settingsOpen, eveningDone: g.state.eveningDoneDay === g.state.day,
  };
});

/** Plays the current phase forward until `until(state)` holds; returns problems and the games seen. */
async function playUntil(page, until, limitMs) {
  const t0 = Date.now();
  const seen = new Set();
  let doneSince = 0, k = 0;
  while (Date.now() - t0 < limitMs) {
    const s = await read(page);
    if (s.name) seen.add(`${s.kind}:${s.name}`);
    if (until(s)) return { problems: [], seen };
    if (s.settings) return { problems: ['settings opened by a stray tap'], seen };
    if (s.transition) { await page.waitForTimeout(150); continue; }
    if (s.phase === 'TRAVEL') { if (s.travelT >= 2) await tap(page, 400, 496); else await page.waitForTimeout(200); continue; }
    if (s.phase === 'RESULTS') { if (s.stamped) await tap(page, 400, 484); await page.waitForTimeout(250); continue; }
    if (s.outcome) { await tap(page, 400, 474); await page.waitForTimeout(250); continue; }
    if (s.choices && !s.name) { await tap(page, 400, 316 + 64 * (k++ % s.choices)); await page.waitForTimeout(250); continue; }
    if (s.name && s.intro) { await tap(page, 400, 300); continue; }
    if (s.name && s.done) {
      // the result card moves on by itself; a card that never does is a stuck screen
      if (!doneSince) doneSince = Date.now();
      if (Date.now() - doneSince > 9000) return { problems: [`${s.name} result card never moved on`], seen };
      await page.waitForTimeout(200);
      continue;
    }
    doneSince = 0;
    if (s.name) {
      // a player tapping around the play area (the game's own AREA, below the HUD gear)
      const x = 130 + ((k * 137) % 540), y = 140 + ((k * 89) % 340); k++;
      await tap(page, x, y);
      await page.waitForTimeout(120);
      continue;
    }
    await page.waitForTimeout(200);
  }
  const s = await read(page);
  return { problems: [`stuck: still in ${s.phase}${s.name ? ` (${s.name}, done ${s.done})` : ''} after ${Math.round(limitMs / 1000)} s`], seen };
}

// Long by design (every challenge, real time): one phone profile is enough.
test.beforeEach(({}, info) => { test.skip(info.project.name !== 'android-chrome', 'playthrough runs on android-chrome only'); });

test('every job challenge, people-skills game and evening game plays through on the real clock', async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 500, day: 4 } });
  const out = [];
  const seen = new Set();
  for (const [tree, title] of JOBS) {
    const t0 = Date.now();
    await page.evaluate(([tree, title]) => {
      const g = window.__game, s = g.state;
      s.energy = 100; s.stress = 0; s.hoursLeft = 24; s.health = 100;
      g.settingsOpen = false; g.message = null;
      const gig = { ...s.todayGigs[0], choiceTree: tree, title, hasQTE: true, remote: false, hours: 1 };
      s.todayGigs.unshift(gig);
      if (!g.acceptGig(gig)) throw new Error('could not accept ' + title + ': ' + g.message);
    }, [tree, title]);
    const r = await playUntil(page, (s) => s.phase !== 'GIG' && s.phase !== 'TRAVEL' && s.phase !== 'RESULTS' && !s.transition, 180_000);
    r.seen.forEach((x) => seen.add(x));
    const skill = [...r.seen].find((x) => x.startsWith('skill:'));
    if (!skill && !r.problems.length) r.problems.push('the job challenge never ran');
    console.log(`${tree}: ${r.problems.length ? 'PROBLEM ' + r.problems.join('; ') : 'ok'} (${[...r.seen].join(', ')}) in ${Math.round((Date.now() - t0) / 1000)} s`);
    r.problems.forEach((p) => out.push(`${tree}: ${p}`));
  }
  for (const id of ['winddown', 'checkin']) {
    const t0 = Date.now();
    await page.evaluate((id) => {
      const g = window.__game, s = g.state;
      s.eveningDoneDay = 0; g.billsOpen = false; g.wrapUpOpen = false;
      g.setPhase('EVENING', 'fade');
      g.eveningChoice(id);
    }, id);
    const r = await playUntil(page, (s) => s.phase === 'EVENING' && !s.transition && s.eveningDone, 120_000);
    r.seen.forEach((x) => seen.add(x));
    console.log(`evening ${id}: ${r.problems.length ? 'PROBLEM ' + r.problems.join('; ') : 'ok'} (${[...r.seen].join(', ')}) in ${Math.round((Date.now() - t0) / 1000)} s`);
    r.problems.forEach((p) => out.push(`evening ${id}: ${p}`));
  }
  // both people-skills games turned up inside the jobs' conversations
  const ei = [...seen].filter((x) => x.startsWith('ei:'));
  console.log('people-skills games seen: ' + ei.join(', '));
  expect(ei.length, 'both people-skills games played').toBeGreaterThanOrEqual(2);
  expect(out, out.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});
