// Keyboard-only play (web pivot, 2026-10-11). A desktop player must be able to play a whole job, every
// job challenge and both evening games without touching the mouse: arrows move the focus ring,
// Enter / Space tap (held = finger down), Escape goes back. Same shape as playthrough.spec.js, but no
// page.mouse anywhere.
import { test, expect } from './fixtures.js';
import { boot } from './helpers.js';

const JOBS = [
  ['movingHelp', 'Help Move Furniture'], ['dogWalking', 'Dog Walking — Energetic Husky'],
  ['garageClean', 'Clean Out Garage'], ['yardWork', 'Yard Work — Leaves & Mowing'],
  ['creativeGig', 'Logo Design — Small Business'], ['mysteryShop', 'Mystery Shopping — Review Store'],
  ['furnitureAssembly', 'Assemble IKEA Furniture'], ['tutoring', 'Tutoring — High School Math'],
  ['photoGig', 'Photography — Product Shots'], ['rushShift', 'Delivery Driver — Rush Shift'],
  ['marketDay', 'Flea Market Stall — Weekend'],
  ['waterSlide', 'Water Slide Tester'], ['cuddler', 'Professional Cuddler'], ['mattressTest', 'Mattress Tester — Hotel Review'],
];
const DIRS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];

const read = (page) => page.evaluate(() => {
  const g = window.__game;
  return {
    phase: g.phase, transition: !!g.transition, outcome: !!g.pendingOutcome,
    choices: g.node ? g.node.choices.length : 0, kind: g.qteKind, name: g.qte?.name ?? null,
    intro: !!g.qteIntroHold, done: !!g.qte?.done, stamped: !!g.receiptStamped,
    settings: !!g.settingsOpen, eveningDone: g.state.eveningDoneDay === g.state.day,
    ring: !!g.kbPoint,
  };
});

async function press(page, key = 'Enter', holdMs = 40) {
  await page.keyboard.down(key);
  await page.waitForTimeout(holdMs);
  await page.keyboard.up(key);
}

/** Plays forward with the keyboard until `until(state)` holds; returns problems and the games seen. */
async function playUntil(page, until, limitMs) {
  const t0 = Date.now();
  const seen = new Set();
  const ringIn = new Set();
  let doneSince = 0, k = 0;
  while (Date.now() - t0 < limitMs) {
    const s = await read(page);
    if (s.name) seen.add(`${s.kind}:${s.name}`);
    if (until(s)) return { problems: [], seen, ringIn };
    if (s.settings) return { problems: ['settings opened by a stray key'], seen, ringIn };
    if (s.transition) { await page.waitForTimeout(150); continue; }
    if (s.name && s.done) {
      if (!doneSince) doneSince = Date.now();
      if (Date.now() - doneSince > 9000) return { problems: [`${s.name} result card never moved on`], seen, ringIn };
      await page.waitForTimeout(200);
      continue;
    }
    doneSince = 0;
    if (s.name && !s.intro) {
      // a player working the challenge: move somewhere, then tap or hold there
      await page.keyboard.press(DIRS[k % 4]);
      if (s.ring) ringIn.add(s.name);
      await press(page, k % 3 === 0 ? 'Space' : 'Enter', k % 3 === 0 ? 450 : 40);
      k++;
      await page.waitForTimeout(100);
      continue;
    }
    // every other screen: Enter on the default focus (Start Gig, first choice, Continue, Tap to start)
    await press(page, 'Enter');
    await page.waitForTimeout(250);
  }
  const s = await read(page);
  return { problems: [`stuck: still in ${s.phase}${s.name ? ` (${s.name}, done ${s.done})` : ''} after ${Math.round(limitMs / 1000)} s`], seen, ringIn };
}

test.beforeEach(({}, info) => { test.skip(info.project.name !== 'desktop-chromium', 'keyboard play runs on desktop-chromium'); });

test('every job challenge and evening game plays through with the keyboard only', async ({ page }) => {
  test.setTimeout(1_200_000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 500, day: 4 } });
  const out = [];
  const ringIn = new Set();
  for (const [tree, title] of JOBS) {
    await page.evaluate(([tree, title]) => {
      const g = window.__game, s = g.state;
      s.energy = 100; s.stress = 0; s.hoursLeft = 24; s.health = 100;
      g.settingsOpen = false; g.message = null;
      const gig = { ...s.todayGigs[0], choiceTree: tree, title, hasQTE: true, remote: false, hours: 1 };
      s.todayGigs.unshift(gig);
      if (!g.acceptGig(gig)) throw new Error('could not accept ' + title + ': ' + g.message);
    }, [tree, title]);
    const r = await playUntil(page, (s) => s.phase !== 'GIG' && s.phase !== 'TRAVEL' && s.phase !== 'RESULTS' && !s.transition, 180_000);
    r.ringIn.forEach((x) => ringIn.add(x));
    if (![...r.seen].some((x) => x.startsWith('skill:')) && !r.problems.length) r.problems.push('the job challenge never ran');
    console.log(`${tree}: ${r.problems.length ? 'PROBLEM ' + r.problems.join('; ') : 'ok'} (${[...r.seen].join(', ')})`);
    r.problems.forEach((p) => out.push(`${tree}: ${p}`));
  }
  for (const id of ['winddown', 'checkin']) {
    await page.evaluate((id) => {
      const g = window.__game, s = g.state;
      s.eveningDoneDay = 0; g.billsOpen = false; g.wrapUpOpen = false;
      g.setPhase('EVENING', 'fade');
      g.eveningChoice(id);
    }, id);
    const r = await playUntil(page, (s) => s.phase === 'EVENING' && !s.transition && s.eveningDone, 120_000);
    console.log(`evening ${id}: ${r.problems.length ? 'PROBLEM ' + r.problems.join('; ') : 'ok'} (${[...r.seen].join(', ')})`);
    r.problems.forEach((p) => out.push(`evening ${id}: ${p}`));
  }
  console.log('focus ring seen inside: ' + [...ringIn].join(', '));
  // positional challenges (dogs, trunk cells, words, bins, steps, framing spots) show a ring on a target
  for (const name of ['UNTANGLE!', 'PACK!', 'PROOFREAD!', 'SORT!', 'ASSEMBLE!', 'FRAME!']) {
    expect(ringIn.has(name), `focus ring inside ${name}`).toBe(true);
  }
  expect(out, out.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Escape pauses a job and closes settings again', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 500, day: 4 } });
  await page.evaluate(() => {
    const g = window.__game, s = g.state;
    const gig = { ...s.todayGigs[0], choiceTree: 'dogWalking', title: 'Dog Walking — Energetic Husky', hasQTE: true, remote: false, hours: 1 };
    s.todayGigs.unshift(gig); g.acceptGig(gig);
  });
  await page.waitForFunction(() => !window.__game.transition && window.__game.phase === 'TRAVEL');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game.settingsOpen)).toBe(true);
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__game.settingsOpen)).toBe(false);
});
