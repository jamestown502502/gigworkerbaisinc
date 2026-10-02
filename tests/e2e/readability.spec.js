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

// Character depth and teaching (2026-10-02): the reaction card after EVERY choice (always with the
// longest client name), EVERY client greeting over every choice node, every minigame's result card
// with its takeaway, and the reveal states of the three new job microgames.
test('every reaction card, client greeting and takeaway is readable', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = [];

  const trees = await page.evaluate(() => Object.keys(window.__choices.CHOICE_TREES));
  for (const tree of trees) {
    const nNodes = await page.evaluate((t) => window.__choices.CHOICE_TREES[t].length, tree);
    for (let n = 0; n < nNodes; n++) {
      const nChoices = await page.evaluate(({ t, n }) => (window.__choices.CHOICE_TREES[t][n].choices || []).length, { t: tree, n });
      for (let c = 0; c < nChoices; c++) {
        for (const line of ['say', 'win', 'lose']) {
          const has = await page.evaluate(({ t, n, c, line }) => {
            const g = window.__game, ch = window.__choices.CHOICE_TREES[t][n].choices[c];
            if (!ch[line]) return false;
            g.phase = 'GIG'; g.qte = null; g.qteKind = null; g.node = null;
            g.currentGig = { ...g.state.todayGigs[0], client: 'Marge', choiceTree: t };
            g.pendingOutcome = { choice: ch.text, text: window.__choices.fillClient(ch[line], 'Marge'), lesson: ch.lesson, effects: { cash: -30, energy: -15, stress: 10, rep: -0.3 }, landed: line !== 'lose', next: null };
            return true;
          }, { t: tree, n, c, line });
          if (has) problems.push(...await audit(page, `reaction ${tree}/${n}/${c} ${line}`));
        }
      }
    }
  }

  // every client's three greetings over the busiest choice node (four choices)
  const names = await page.evaluate(() => window.__clients.CLIENT_NAMES);
  for (const name of names) {
    for (const how of ['meet', 'back', 'wary']) {
      await page.evaluate(({ name, how }) => {
        const g = window.__game, C = window.__clients;
        const c = C.CLIENTS.find((x) => x.name === name);
        g.phase = 'GIG'; g.qte = null; g.qteKind = null; g.pendingOutcome = null;
        g.currentGig = { ...g.state.todayGigs[0], client: name, choiceTree: 'waterSlide' };
        g.node = window.__choices.CHOICE_TREES.waterSlide[0];
        g.clientGreeting = c[how].replace(/\{lastJob\}/g, 'mystery shopping');
      }, { name, how });
      problems.push(...await audit(page, `greeting ${name} ${how}`));
    }
  }

  // every result card that carries a takeaway: each microgame (won and fumbled) and each EI game
  const micro = await page.evaluate(() => Object.keys(window.__micro.MICROGAME_BY_TREE));
  for (const tree of micro) {
    for (const success of [true, false]) {
      await page.evaluate(({ tree, success }) => {
        const g = window.__game;
        g.phase = 'GIG'; g.qteKind = 'skill'; g.qteReadyT = 99; g.qteIntroHold = false; g.pendingOutcome = null;
        g.currentGig = g.state.todayGigs[0];
        g.qte = new window.__micro.MICROGAME_BY_TREE[tree](g.state);
        g.qte.done = true; g.qte.result = { success, score: success ? 72 : 20, lesson: g.qte.result?.lesson || window.__micro.LESSONS[Object.keys(window.__micro.LESSONS)[0]] };
        g.qteEndTimer = 1; g.qteFxFired = true; // a settled card, past its 0.2 s completion flash
      }, { tree, success });
      problems.push(...await audit(page, `result ${tree} ${success ? 'won' : 'fumbled'}`));
    }
  }
  for (const [kind, lesson] of await page.evaluate(() => [
    ...Object.values(window.__qte.FEELING_LESSON).map((l) => ['ei', l]),
    ['ei', window.__qte.THREAD_LESSON.client], ['evening', window.__qte.THREAD_LESSON.friend], ['evening', window.__qte.BREATH_LESSON],
  ])) {
    await page.evaluate(({ kind, lesson }) => {
      const g = window.__game, Q = window.__qte;
      g.phase = kind === 'ei' ? 'GIG' : 'EVENING_GAME'; g.qteKind = kind;
      g.qte = kind === 'ei' ? new Q.ReadClient(g.state, Q.READ_CLIENT_SCENARIOS[0]) : new Q.ThreadGame('friend', Q.CHECK_IN_THREADS[0]);
      if (lesson === Q.BREATH_LESSON) g.qte = new Q.Breathe();
      g.qte.done = true; g.qte.result = { success: true, score: 70, lesson, effects: { rep: 0.3, stress: -4, support: 12 } };
      g.qteEndTimer = 1;
    }, { kind, lesson });
    problems.push(...await audit(page, `result ${kind}: ${lesson.slice(0, 24)}`));
  }

  // the new microgames' teaching moments: a wrong ASSEMBLE step, every PERCENT working, every FRAME verdict
  await page.evaluate(() => {
    const g = window.__game, M = window.__micro;
    g.phase = 'GIG'; g.qteKind = 'skill'; g.qteReadyT = 99; g.qteEndTimer = 0;
    g.qte = new M.AssembleSteps(g.state, M.RECIPES[2]);
    const c = g.qte.cards.find((x) => x.i === 5); g.qte.handleTap({ x: c.box.x + 5, y: c.box.y + 5 });
  });
  problems.push(...await audit(page, 'assemble wrong step'));
  const nP = await page.evaluate(() => window.__micro.PERCENT_PROBLEMS.length);
  for (let i = 0; i < nP; i++) {
    await page.evaluate((i) => {
      const g = window.__game, M = window.__micro;
      g.qte = new M.PercentTutor(g.state, [M.PERCENT_PROBLEMS[i]]);
      g.qte.answer(M.PERCENT_PROBLEMS[i].wrong[0]);
    }, i);
    problems.push(...await audit(page, `percent ${i} working`));
  }
  for (const spot of ['tl', 'br', 'c']) {
    await page.evaluate((spot) => {
      const g = window.__game, M = window.__micro;
      g.qte = new M.FrameShot(g.state, [M.FRAME_SHOTS[0]]);
      g.qte.place(spot);
    }, spot);
    problems.push(...await audit(page, `frame ${spot}`));
  }

  expect(problems, problems.join('\n')).toEqual([]);
});
