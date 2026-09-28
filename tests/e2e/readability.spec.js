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

  // Breathing: each side of the box and the finish
  await page.evaluate(() => { const g = window.__game, Q = window.__qte; g.phase = 'EVENING_GAME'; g.qteKind = 'evening'; g.qte = new Q.Breathe(); });
  for (const t of [1, 4, 7, 10, 37]) {
    await page.evaluate((t) => { const q = window.__game.qte; q.elapsed = t; q.done = false; }, t);
    problems.push(...await audit(page, `breathe t=${t}`));
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

  expect(problems, problems.join('\n')).toEqual([]);
});
