import { test, expect } from '@playwright/test';
import { boot, settleMorning, auditText as audit } from './helpers.js';

// Readability audit (2026-09-28). The text-overlap sweep missed a Text Back bubble spilling onto
// the temperature meter because it rendered one random thread at its first message. This renders
// EVERY client read, text thread and call at every step, plus the breathing game, the creator,
// settings and the welcome-back prompt, and checks each drawn string on the real canvas:
//   1. no two strings overlap
//   2. nothing is drawn off the 800x600 canvas
//   3. nothing is smaller than 11 px
//   4. contrast against the pixels actually behind it meets WCAG AA (4.5:1, or 3:1 for large text:
//      24 px, or 18.66 px bold). Outlined text is exempt: its dark stroke carries the contrast.

test('every EI scenario, the breathing game and the new screens are readable', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  // Only this test moves the clock (game.step): nothing may finish between two measurements.
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = [];

  // Read the Client: every scenario, all three steps
  const nRead = await page.evaluate(() => window.__qte.READ_CLIENT_SCENARIOS.length);
  for (let i = 0; i < nRead; i++) {
    await page.evaluate((i) => {
      const g = window.__game, Q = window.__qte;
      g.phase = 'GIG'; g.currentGig = g.state.todayGigs[0]; g.qteKind = 'ei'; g.qteReadyT = 99;
      g.qte = new Q.ReadClient(g.state, Q.READ_CLIENT_SCENARIOS[i]);
      g.step(1 / 60);
    }, i);
    problems.push(...await audit(page, `read ${i} looking`));
    await page.evaluate(() => { window.__game.qte.readT = 3; });
    problems.push(...await audit(page, `read ${i} pick`));
    await page.evaluate(() => { const q = window.__game.qte; q.picked = q.s.options.find((o) => o !== q.s.feeling); q.step = 1; });
    problems.push(...await audit(page, 'read respond'));
    await page.evaluate(() => { const q = window.__game.qte; q.response = q.s.responses[0]; q.step = 2; });
    problems.push(...await audit(page, 'read reveal'));
  }

  // Text Back and Check In: every thread, after every reply, always taking the LONGEST reply so the
  // thread is at its tallest
  for (const mode of ['client', 'friend']) {
    const n = await page.evaluate((m) => (m === 'client' ? window.__qte.TEXT_BACK_THREADS : window.__qte.CHECK_IN_THREADS).length, mode);
    for (let i = 0; i < n; i++) {
      await page.evaluate(({ m, i }) => {
        const g = window.__game, Q = window.__qte;
        g.phase = m === 'client' ? 'GIG' : 'EVENING_GAME'; g.qteKind = m === 'client' ? 'ei' : 'evening'; g.qteReadyT = 99;
        g.qte = new Q.ThreadGame(m, (m === 'client' ? Q.TEXT_BACK_THREADS : Q.CHECK_IN_THREADS)[i]);
        g.step(1 / 60);
      }, { m: mode, i });
      for (let k = 0; k <= 3; k++) {
        problems.push(...await audit(page, `${mode} ${i} msg ${k}`));
        const more = await page.evaluate(() => {
          const q = window.__game.qte;
          if (q.idx >= q.thread.msgs.length) return false;
          const rs = q.thread.msgs[q.idx].replies;
          q.reply(rs.reduce((a, b) => (b.text.length > a.text.length ? b : a)));
          return true;
        });
        if (!more) break;
      }
    }
  }

  // Breathing: the choice screen (with and without eyes closed), both patterns through every side,
  // the finish, and the eyes-closed exercise
  await page.evaluate(() => { const g = window.__game, Q = window.__qte; g.phase = 'EVENING_GAME'; g.qteKind = 'evening'; g.qte = new Q.Breathe(); });
  problems.push(...await audit(page, 'breathe choose'));
  await page.evaluate(() => { window.__game.qte.eyesClosed = true; });
  problems.push(...await audit(page, 'breathe choose eyes-closed'));
  for (const [key, times] of [['calm', [1, 6, 31]], ['focus', [1, 5, 9, 13, 33]]]) {
    await page.evaluate((k) => { const g = window.__game, Q = window.__qte; g.qte = new Q.Breathe(); g.qte.start(k); }, key);
    for (const t of times) {
      await page.evaluate((t) => { const q = window.__game.qte; q.elapsed = t; q.done = false; }, t);
      problems.push(...await audit(page, `breathe ${key} t=${t}`));
    }
  }
  await page.evaluate(() => { const g = window.__game, Q = window.__qte; g.qte = new Q.Breathe(); g.qte.eyesClosed = true; g.qte.start('calm'); g.qte.elapsed = 3; });
  problems.push(...await audit(page, 'breathe eyes-closed'));

  // Text Back drafting: a harsh reply hovering over Send, and after it is deleted
  await page.evaluate(() => {
    const g = window.__game, Q = window.__qte;
    g.phase = 'GIG'; g.qteKind = 'ei'; g.qte = new Q.ThreadGame('client', Q.TEXT_BACK_THREADS[5]);
    for (let i = 0; i < 90; i++) g.qte.update(1 / 60);
    g.qte.choose(g.qte.thread.msgs[0].replies.find((r) => r.tag === 'def'));
    for (let i = 0; i < 90; i++) g.qte.update(1 / 60);
  });
  problems.push(...await audit(page, 'textback harsh draft'));
  await page.evaluate(() => { window.__game.qte.deleteDraft(); });
  problems.push(...await audit(page, 'textback rewritten'));

  // every job microgame, at the start and part-way through
  const trees = await page.evaluate(() => Object.keys(window.__micro.MICROGAME_BY_TREE));
  for (const tree of trees) {
    await page.evaluate((tree) => {
      const g = window.__game;
      g.phase = 'GIG'; g.qteKind = 'skill'; g.qteReadyT = 99;
      g.currentGig = g.state.todayGigs[0];
      g.qte = new window.__micro.MICROGAME_BY_TREE[tree](g.state);
    }, tree);
    problems.push(...await audit(page, `micro ${tree} start`));
    await page.evaluate(() => { const q = window.__game.qte; for (let i = 0; i < 120 && !q.done; i++) q.update(1 / 60, { down: false }); });
    problems.push(...await audit(page, `micro ${tree} 2s`));
  }

  // creator (both titles), settings with the confirm showing, welcome back (both states)
  await page.evaluate(() => { const g = window.__game; g.qte = null; g.qteKind = null; g.phase = 'CREATE'; g.creatorEditing = false; });
  problems.push(...await audit(page, 'creator'));
  await page.evaluate(() => { const g = window.__game; g.phase = 'MORNING'; g.settingsOpen = true; g.confirmReset = true; });
  problems.push(...await audit(page, 'settings'));
  await page.evaluate(() => { const g = window.__game; g.settingsOpen = false; g.confirmReset = false; g.resumePrompt = true; g.confirmNewGame = false; });
  problems.push(...await audit(page, 'welcome back'));
  await page.evaluate(() => { window.__game.confirmNewGame = true; });
  problems.push(...await audit(page, 'welcome back confirm'));

  // the math of the month, on the day-30 summary and on the eviction screen
  await page.evaluate(() => {
    const g = window.__game; g.resumePrompt = false; g.confirmNewGame = false;
    g.state.totalEarned = 1432; g.state.monthMath = { paidHours: 96, gigs: 24, lostToNonPayment: 185, rentPaid: 1800, phonePaid: 120, travelEnergy: 84, sickDays: 2 };
    g.phase = 'SUMMARY'; g.mathOpen = false;
  });
  problems.push(...await audit(page, 'summary buttons'));
  await page.evaluate(() => { window.__game.mathOpen = true; });
  problems.push(...await audit(page, 'math of the month'));
  await page.evaluate(() => { const g = window.__game; g.mathOpen = false; g.phase = 'GAMEOVER'; });
  problems.push(...await audit(page, 'gameover buttons'));

  expect(problems, problems.join('\n')).toEqual([]);
});
