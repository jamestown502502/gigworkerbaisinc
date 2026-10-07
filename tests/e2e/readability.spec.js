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

// Skill-testing mechanics and spaced recall (2026-10-02, part 2): LIFT while bending, RAKE before
// and after the pile is placed (both sides of the wind, mid-gust), UNTANGLE's named-leash line, and
// every recall question before and after it is answered (right and wrong).
test('the new mechanics and every recall card are readable', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = [];
  const micro = async (setup, label) => {
    await page.evaluate(setup);
    problems.push(...await audit(page, label));
  };
  const base = 'const g = window.__game, M = window.__micro; g.phase = "GIG"; g.qteKind = "skill"; g.qteReadyT = 99; g.qteIntroHold = false; g.qteEndTimer = 0; g.pendingOutcome = null; g.currentGig = g.state.todayGigs[0];';
  await micro(new Function(`${base} g.qte = new M.LiftOnThree(g.state); g.qte.t = 0.6;`), 'lift counting');
  await micro(new Function(`${base} g.qte = new M.LiftOnThree(g.state); g.qte.t = 0.8; g.qte.squat = 0.5;`), 'lift knees bent');
  await micro(new Function(`${base} g.qte = new M.LiftOnThree(g.state); g.qte.t = g.qte.liftAt(); g.qte.handleTap();`), 'lift back-lift line');
  for (const wind of [1, -1]) {
    await micro(new Function(`${base} g.qte = new M.RakeThePile(g.state); g.qte.wind = ${wind};`), `rake place wind ${wind}`);
    for (const side of [1, -1]) {
      await micro(new Function(`${base} g.qte = new M.RakeThePile(g.state); g.qte.wind = ${wind}; g.qte.placePile(${side}); g.qte.gust = 0.5;`), `rake pile ${side} wind ${wind} gust`);
    }
  }
  await micro(new Function(`${base} g.qte = new M.UntangleLeash(g.state); const u = g.qte.dogs[g.qte.stack[0]]; g.qte.handleTap(g.qte.dogPos(u));`), 'untangle wrong leash');

  const n = await page.evaluate(() => window.__recall.RECALL_BANK.length);
  for (let i = 0; i < n; i++) {
    for (const pick of ['open', 'right', 'wrong']) {
      await page.evaluate(({ i, pick }) => {
        const g = window.__game, R = window.__recall;
        g.qte = null; g.qteKind = null; g.phase = 'MORNING';
        const r = R.RECALL_BANK[i];
        const s = g.state; s.day = R.RECALL_DAYS[0]; s.lessonsSeen = [r.lesson]; s.recallDone = [];
        const card = R.recallCard(s, () => 0);
        g.eventQueue = []; g.activeEvent = { ...card }; g.eventT = 1; g.eventOutcome = '';
        if (pick !== 'open') g.chooseEventOption(card.choices.find((o) => (o.text === r.options[0]) === (pick === 'right')));
        g.eventT = 1;
      }, { i, pick });
      problems.push(...await audit(page, `recall ${i} ${pick}`));
    }
  }

  expect(problems, problems.join('\n')).toEqual([]);
});

// Long-form jobs (2026-10-03): every screen of RUSH! and MARKET!, including the longest feedback
// lines and the result card's money lines.
test('RUSH! and MARKET! are readable in every state', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = [];
  const shot = async (fn, label) => { await page.evaluate(fn); problems.push(...await audit(page, label)); };
  const setup = 'const g = window.__game, M = window.__micro, L = window.__longform; g.phase = "GIG"; g.qteKind = "skill"; g.qteReadyT = 99; g.qteIntroHold = false; g.qteEndTimer = 0; g.pendingOutcome = null; g.node = null; g.currentGig = g.state.todayGigs[0];';
  const order = '{ pay: 14.75, miles: 8.9, minutes: 29 }';
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.order = ${order}; g.qte.decideLeft = 3;`), 'rush order');
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.order = ${order}; g.qte.decideLeft = 3; g.qte.accepted = 1; g.qte.declined = 4; g.qte.pay = 123; g.qte.miles = 88; g.qte.clock = 100;`), 'rush low priority');
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.order = { pay: 4.5, miles: 8.8, minutes: 29 }; g.qte.accept();`), 'rush bad accept');
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.order = ${order}; g.qte.decline();`), 'rush good declined');
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.order = ${order}; g.qte.decline(true);`), 'rush missed');
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.nextPing = 9;`), 'rush waiting');
  await shot(new Function(`${setup} g.qte = new L.RushShift(g.state); g.qte.order = ${order}; g.qte.accept(); g.qte.verdict = null;`), 'rush driving');
  await shot(new Function(`${setup} g.qte = new L.MarketDay(g.state);`), 'market buy');
  await shot(new Function(`${setup} g.qte = new L.MarketDay(g.state); [0, 1, 2, 3].forEach((i) => g.qte.toggle(i)); g.qte.toggle(4);`), 'market over budget');
  for (const kind of ['eager', 'bargain', 'browser']) {
    for (const item of [1, 5]) {
      await shot(new Function(`${setup} const q = new L.MarketDay(g.state); q.toggle(${item}); q.openStall(); q.customers[0].kind = "${kind}"; g.qte = q;`), `market ${kind} item ${item}`);
      for (const choice of ['take', 'half', 'hold', 'none']) {
        await shot(new Function(`${setup} const q = new L.MarketDay(g.state); q.toggle(${item}); q.openStall(); q.customers[0].kind = "${kind}"; q.respond("${choice}"); g.qte = q;`), `market ${kind} ${item} ${choice}`);
      }
    }
  }
  for (const [tree, items, hourly] of [['rushShift', [{ label: 'Order pay (12 orders)', amount: 118 }, { label: 'Gas and wear (96 mi)', amount: -34 }], 14.25], ['marketDay', [{ label: 'Sales (4 items)', amount: 96 }, { label: 'Thrift stock', amount: -29 }], undefined]]) {
    for (const success of [true, false]) {
      await shot(new Function(`${setup} g.qte = new M.MICROGAME_BY_TREE["${tree}"](g.state); g.qte.done = true; g.qte.result = { success: ${success}, score: ${success ? 74 : 31}, items: ${JSON.stringify(items)}, hourly: ${hourly === undefined ? 'undefined' : hourly}, lesson: L.LONGFORM_LESSONS.${tree === 'rushShift' ? 'rush' : 'market'} }; g.qteEndTimer = 1; g.qteFxFired = true;`), `result ${tree} ${success}`);
    }
  }
  expect(problems, problems.join('\n')).toEqual([]);
});

// Polish (2026-10-04): the receipt mid-print and stamped, the verb punch, Five Stars, the heartbeat
// glow at high stress, the SOLD stamp, the car on its route, the recall sticker.
test('polish states are readable', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = [];
  const shot = async (fn, label) => { await page.evaluate(fn); problems.push(...await audit(page, label)); };
  const gigSetup = 'const g = window.__game, M = window.__micro, L = window.__longform; g.phase = "GIG"; g.qteKind = "skill"; g.qteIntroHold = false; g.qteEndTimer = 0; g.pendingOutcome = null; g.node = null; g.currentGig = g.state.todayGigs[0]; g.fiveStarsT = null;';
  for (const t of [0.05, 0.15, 0.6, 1.2]) {
    await shot(new Function(`${gigSetup} g.qte = new M.LiftOnThree(g.state); g.qteReadyT = ${t};`), `verb punch t=${t}`);
  }
  await shot(new Function(`${gigSetup} g.state.stress = 92; g.qte = new M.PackTheCar(g.state); g.qteReadyT = 99;`), 'heartbeat glow');
  for (const t of [0.1, 0.5, 1.5]) {
    await shot(new Function(`${gigSetup} g.state.stress = 20; g.qte = new M.LiftOnThree(g.state); g.qteReadyT = 99; g.qte.done = true; g.qte.result = { success: true, score: 100, lesson: M.LESSONS.lift }; g.qteEndTimer = 1; g.qteFxFired = true; g.fiveStarsT = ${t};`), `five stars t=${t}`);
  }
  await shot(new Function(`${gigSetup} const q = new L.MarketDay(g.state); q.toggle(0); q.openStall(); q.customers[0].kind = 'eager'; q.respond('hold'); g.qte = q; g.qteReadyT = 99;`), 'market sold stamp');
  await shot(new Function(`${gigSetup} const q = new L.RushShift(g.state); q.order = { pay: 9, miles: 5, minutes: 19 }; q.accept(); q.verdict = null; q.driving.left = 0.6; g.qte = q; g.qteReadyT = 99;`), 'rush driving');
  await shot(new Function(`${gigSetup} const q = new L.RushShift(g.state); q.order = { pay: 9, miles: 5, minutes: 19 }; q.orderAt = q.t - 0.1; q.decideLeft = 4; g.qte = q; g.qteReadyT = 99;`), 'rush order dropping in');
  // the results receipt, at several points of its print
  await page.evaluate(() => {
    const g = window.__game;
    g.qte = null; g.qteKind = null; g.phase = 'GIG';
    const gig = { title: 'Help Move Furniture', type: 'physical', payout: 80, hours: 2, risk: 0, location: 'safe', hasQTE: false, choiceTree: 'movingHelp', client: 'Walt', clientReliability: 5, isRepeat: false, remote: true };
    g.currentGig = gig; g.snapshot = { cash: g.state.cash, stress: g.state.stress, rep: g.state.reputation, energy: g.state.energy };
    g.outcomeTexts = ['Walt thinks it over and nods. Two trips, nothing dropped, nobody hurt.'];
    g.finishGig(null); g.phase = 'RESULTS';
  });
  for (const t of [0.05, 0.3, 0.7, 2]) {
    await shot(new Function(`window.__game.resultsT = ${t};`), `receipt t=${t}`);
  }
  // recall: answered right, with its sticker
  await page.evaluate(() => {
    const g = window.__game, R = window.__recall;
    g.phase = 'MORNING';
    const r = R.RECALL_BANK[0]; const s = g.state; s.day = R.RECALL_DAYS[0]; s.lessonsSeen = [r.lesson]; s.recallDone = [];
    const card = R.recallCard(s, () => 0);
    g.eventQueue = []; g.activeEvent = { ...card }; g.eventOutcome = '';
    g.chooseEventOption(card.choices.find((o) => o.text === r.options[0])); g.eventT = 1;
  });
  problems.push(...await audit(page, 'recall right sticker'));
  expect(problems, problems.join('\n')).toEqual([]);
});

// Frame budget (2026-10-04): what the busiest polish moment COSTS. Five Stars (a 30-particle burst,
// coins in flight, the card popping) is timed against the identical result card without it, so the
// test measures the polish rather than the machine: headless Firefox on Windows takes ~18 ms for a
// plain screen with no polish at all, while Chromium takes under 1 ms.
test('the busiest polish moment adds almost nothing to a frame', async ({ page }) => {
  await boot(page, { save: { tutorialSeen: true, energy: 100, cash: 300, day: 5 } });
  await settleMorning(page);
  const ms = await page.evaluate(() => {
    window.__loopPaused = true;
    const g = window.__game, M = window.__micro;
    const median = () => { const ts = []; for (let i = 0; i < 60; i++) { const t0 = performance.now(); g.step(1 / 60); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return ts[30]; };
    const card = (score) => {
      g.phase = 'GIG'; g.qteKind = 'skill'; g.qteIntroHold = false; g.qteReadyT = 99; g.qteEndTimer = 0; g.qteFxFired = false; g.node = null; g.pendingOutcome = null;
      g.currentGig = g.state.todayGigs[0];
      g.qte = new M.LiftOnThree(g.state); g.qte.done = true; g.qte.result = { success: true, score, lesson: M.LESSONS.lift };
      g.step(1 / 60);   // fires the burst and the coins when the score earns Five Stars
      return median();
    };
    const plain = card(70);
    const five = card(100);
    return { plain, five };
  });
  console.log(`result card frame: plain ${ms.plain.toFixed(2)} ms, five stars ${ms.five.toFixed(2)} ms`);
  expect(ms.five).toBeLessThan(ms.plain * 1.5 + 2);
});

// QA round 3 (2026-10-06): every screen that changed or appeared.
test('QA round 3 screens are readable', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, energy: 100, cash: 900, day: 13, daysUntilBills: 2, gigsCompleted: 31, runNumber: 2, lastRun: { day: 30, cash: 2210, complete: true, evicted: false }, lastPlayed: Date.now() - 86400000 }, keepResumePrompt: true });
  await page.evaluate(() => { window.__loopPaused = true; window.__game.step(1 / 60); });
  const problems = [];
  // Screens are set up by hand, so a transition started by a setup call (goBrowse, goEvening) is
  // dropped: it would otherwise swap the phase under a later shot.
  const shot = async (fn, label) => { await page.evaluate(fn); await page.evaluate(() => { window.__game.transition = null; }); problems.push(...await audit(page, label)); };
  await shot(() => {}, 'welcome back');
  await shot(() => { const s = window.__state; s.unpaidRent = 600; s.rentOverdueDays = 5; window.__game.confirmNewGame = true; }, 'welcome back, overdue, confirm');
  await page.evaluate(() => { const g = window.__game, s = g.state; g.resumePrompt = false; g.confirmNewGame = false; s.unpaidRent = 0; s.rentOverdueDays = 0; g.ticker = { lines: [], idx: 0, t: 0 }; g.eventQueue = []; g.activeEvent = null; });
  await shot(() => {}, 'apartment, pay rent early');
  await shot(() => { window.__game.payRentEarly(); window.__game.step(2); }, 'apartment, rent paid early'); // the -$ float has risen away
  await shot(() => { const g = window.__game; g.message = ''; g.goBrowse(); g.phase = 'BROWSE'; g.message = 'Pick a gig first: tap a card above to choose it.'; g.listHintAt = Date.now() - 450; }, 'listings, pick a gig first');
  await shot(() => { const g = window.__game, s = g.state; g.message = ''; s.cash = 120; s.rentPrepaid = false; s.daysUntilBills = 0; g.phase = 'EVENING'; g.ping = null; g.goEvening(); g.payBill('rent'); }, 'bills, rent short');
  await shot(() => { window.__game.payBill('food'); window.__game.payBill('phone'); }, 'bills, after paying what fits');
  await page.evaluate(() => { const g = window.__game; g.closeBills(); g.finishWrapUp(); });
  await shot(() => { const g = window.__game; g.ping = { gig: { title: 'Early call: Help Move Furniture', payout: 96 }, resolved: false, text: '' }; }, 'late ping, decide later');
  await shot(() => { window.__game.resolvePing('later'); }, 'evening, ping waiting');
  await shot(() => { const g = window.__game, s = g.state; s.eveningDoneDay = s.day; g.eveningOutcome = "You found the rhythm. -14 stress, +3 balance. Tomorrow's timed challenges will feel easier."; }, 'evening done, where you stand');
  await shot(() => { const g = window.__game, s = g.state; g.eveningOutcome = 'Your sister picks up on the second ring. You talk until the kettle boils twice. Support +6.'; s.cash = 2000; }, 'evening done, long outcome, pay rent early');
  // every morning event that applies an effect, with its outcome line
  const ids = await page.evaluate(() => window.__events.EVENTS.filter((e) => e.effect).map((e) => e.id));
  for (const id of ids) {
    await shot(new Function(`const g = window.__game, E = window.__events; g.phase = 'MORNING'; g.ping = null; const e = E.EVENTS.find((x) => x.id === '${id}'); g.eventQueue = [e]; g.activeEvent = null; g.ticker = { lines: [], idx: 0, t: 0 }; g.startNextEvent(); g.eventT = 1;`), `event ${id}`);
  }
  await page.evaluate(() => { const g = window.__game; g.activeEvent = null; g.eventQueue = []; });
  await shot(() => { window.__game.staleTab = true; }, 'open in another tab');
  expect(problems, problems.join('\n')).toEqual([]);
});

// Depth pass (2026-10-07): every new or changed state.
test('depth pass screens are readable', async ({ page }) => {
  test.setTimeout(240000);
  await boot(page, { save: { tutorialSeen: true, characterCreated: true, energy: 100, cash: 430, day: 12, daysUntilBills: 4, gigsCompleted: 20, runNumber: 5, twist: 'heatwave', health: 35, upgradesOwned: ['Bike', 'Laptop', 'Tool Belt', 'Better Shoes', 'Phone Upgrade'], hasToolBelt: true, paceLog: [60, 80, 40] } });
  await settleMorning(page);
  await page.evaluate(() => { window.__loopPaused = true; });
  const problems = [];
  const shot = async (fn, label) => { await page.evaluate(fn); await page.evaluate(() => { window.__game.transition = null; window.__game.step(1 / 60); }); problems.push(...await audit(page, label)); };
  await shot(() => {}, 'apartment: props, forecast short');
  await shot(() => { const s = window.__state; s.paceLog = [200, 210]; }, 'apartment: forecast on pace');
  await shot(() => { const s = window.__state; s.unpaidRent = 600; s.rentOverdueDays = 4; s.cash = 300; }, 'apartment: overdue, pay part');
  await shot(() => { const g = window.__game, s = g.state; s.unpaidRent = 0; s.rentOverdueDays = 0; s.clientLog = { Rosa: { visits: 3, good: 3, bad: 0, lastGood: true, lastJob: 'Help Move Furniture' } }; const c = g.clientOfferCard(); g.eventQueue = [c]; g.activeEvent = null; g.startNextEvent(); g.eventT = 1; }, 'contract offer');
  await shot(() => { const g = window.__game, s = g.state; s.clientLog.Rosa.contractOffered = true; s.day = 20; const R = Math.random; Math.random = () => 0.1; const c = g.clientOfferCard(); Math.random = R; g.activeEvent = null; g.eventQueue = [c]; g.startNextEvent(); g.eventT = 1; }, 'referral');
  await shot(() => { const g = window.__game, s = g.state; s.twist = 'rentHike'; s.day = 17; s.weekNumber = 3; s.choresWeek = 0; const c = g.choresCard(); g.activeEvent = null; g.eventQueue = [c]; g.startNextEvent(); g.eventT = 1; }, 'chores');
  await shot(() => { const g = window.__game, s = g.state; g.activeEvent = null; g.eventQueue = []; s.twist = 'heatwave'; s.cash = 400; s.daysUntilBills = 0; g.phase = 'EVENING'; g.ping = null; g.goEvening(); }, 'bills: pay part');
  await shot(() => { window.__game.payRentPartial(); }, 'bills: after part');
  await page.evaluate(() => { const g = window.__game; g.closeBills(); g.finishWrapUp(); g.phase = 'MORNING'; });
  // the browse board with a contract, a regular and a wary client
  await shot(() => { const g = window.__game, s = g.state; s.contracts = [{ client: 'Rosa', title: 'Help Move Furniture', payout: 130, every: 5, nextDay: s.day }]; s.clientLog.Tony = { visits: 1, good: 0, bad: 1, lastGood: false }; s.clientLog.Dev = { visits: 2, good: 2, bad: 0, lastGood: true }; s.todayGigs = window.__gigs.generateDailyGigs(s); s.todayGigs[1].client = 'Tony'; s.todayGigs[1].standing = 'wary'; s.todayGigs[2].client = 'Dev'; s.todayGigs[2].standing = 'regular'; g.goBrowse(); g.phase = 'BROWSE'; }, 'board: contract, regular, wary');
  // challenge variants, intro and play
  const gigSetup = 'const g = window.__game, M = window.__micro; g.phase = "GIG"; g.qteKind = "skill"; g.qteEndTimer = 0; g.pendingOutcome = null; g.node = null; g.currentGig = g.state.todayGigs[0]; g.fiveStarsT = null;';
  for (const [cls, label] of [['PackTheCar', 'pack fragile'], ['RakeThePile', 'rake shift'], ['SortReturns', 'sort final']]) {
    await shot(new Function(`${gigSetup} g.qte = new M.${cls}(g.state, ${cls === 'SortReturns' ? 'null, ' : ''}{ variant: true }); g.qteIntroHold = true; g.qteReadyT = 0;`), `${label} intro`);
    await shot(new Function(`${gigSetup} g.qte = new M.${cls}(g.state, ${cls === 'SortReturns' ? 'null, ' : ''}{ variant: true }); g.qteIntroHold = false; g.qteReadyT = 99; ${cls === 'RakeThePile' ? 'g.qte.placePile(1); g.qte.timeLeft = g.qte.timeMax / 2 - 0.01; g.qte.update(0.02, { down: false });' : ''}`), `${label} play`);
  }
  // a compact (already-seen) reaction card
  await shot(() => { const g = window.__game; g.qte = null; g.qteKind = null; g.phase = 'GIG'; g.pendingOutcome = { choice: 'Offer to do 2 trips instead', text: 'Rosa thinks it over and nods. Two trips, nothing dropped, nobody hurt.', lesson: 'Offering a safer plan, instead of a flat no, keeps the job and your reputation.', effects: { energy: -5, rep: 0.2 }, landed: true, known: true }; }, 'compact reaction card');
  // why it went this way
  await shot(() => { const g = window.__game, s = g.state; g.pendingOutcome = null; Object.assign(s.monthMath, { paidHours: 45, byType: { physical: { earned: 600, hours: 30, gigs: 8 }, creative: { earned: 500, hours: 15, gigs: 4 } }, lostToNonPayment: 110, toolBeltExtra: 95, lateHustles: 3, hustleCash: 90, firstOverdueDay: 15, tips: 24, partialRent: 380, sickDays: 2, travelSaved: 40 }); s.totalEarned = 1100; g.phase = 'SUMMARY'; g.mathOpen = true; g.mathPage = 1; }, 'why it went this way');
  await shot(() => { const g = window.__game; g.mathPage = 0; }, 'math page one');
  // creator with a background
  await shot(() => { const g = window.__game; g.mathOpen = false; g.phase = 'CREATE'; g.creatorEditing = false; g.state.background = 'local'; }, 'creator: background');
  expect(problems, problems.join('\n')).toEqual([]);
});
