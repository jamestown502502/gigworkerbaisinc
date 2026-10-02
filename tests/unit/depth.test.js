// Character depth and teaching (2026-10-02): every choice answers with the client's reaction and a
// takeaway, clients remember you, every minigame says why on its result card, and the three new
// job microgames can be won, lost by doing nothing, and teach what they score.
import { describe, expect, it } from 'vitest';
import { CHOICE_TREES, resolveChoice, fillClient } from '../../src/game/choices.js';
import { CLIENTS, CLIENT_NAMES, clientGreeting, rememberClient, jobNoun } from '../../src/game/clients.js';
import { LESSONS, HEAVY, PackTheCar, AssembleSteps, RECIPES, PercentTutor, PERCENT_PROBLEMS, FrameShot, FRAME_SHOTS, FRAME_SPOTS, frameVerdict, createQTE } from '../../src/game/microgames.js';
import { FEELING_LESSON, THREAD_LESSON, BREATH_LESSON, ReadClient, ThreadGame, READ_CLIENT_SCENARIOS } from '../../src/game/qte.js';
import { GIG_TEMPLATES } from '../../src/game/gigs.js';
import { makeGame, withRandom } from './helpers.js';
import { RECALL_BANK, RECALL_DAYS, recallCard, recallCandidates } from '../../src/game/recall.js';

const CALM = { stress: 0, energy: 100, health: 100, settings: {} };
const DT = 1 / 60;
const allChoices = () => Object.entries(CHOICE_TREES).flatMap(([tree, nodes]) => nodes.filter((n) => n.choices).flatMap((n) => n.choices.map((c) => ({ tree, c }))));

describe('every gig choice answers with a reaction and a takeaway', () => {
  it('each choice has a lesson, and the right reaction lines for how it resolves', () => {
    const list = allChoices();
    expect(list.length).toBeGreaterThanOrEqual(38);
    for (const { tree, c } of list) {
      const id = `${tree}: ${c.text}`;
      expect(c.lesson, id).toBeTruthy();
      expect(c.lesson.length, id).toBeLessThanOrEqual(110);
      const rolled = c.result.chance !== undefined;
      if (rolled) { expect(c.win, id).toBeTruthy(); expect(c.lose, id).toBeTruthy(); } else expect(c.say, id).toBeTruthy();
      for (const line of [c.say, c.win, c.lose].filter(Boolean)) {
        expect(line.length, line).toBeLessThanOrEqual(130);
        expect(line.replace(/\{client\}/g, ''), line).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it('resolveChoice returns the authored reaction, not the generic one', () => {
    const c = CHOICE_TREES.movingHelp[0].choices[2]; // hourly: chance 0.6
    const s = makeGame().state;
    const hit = withRandom([0.1], () => resolveChoice(s, c));
    expect(hit.outcomeText).toBe(c.win);
    expect(hit.landed).toBe(true);
    const miss = withRandom([0.9], () => resolveChoice(s, c));
    expect(miss.outcomeText).toBe(c.lose);
    expect(miss.landed).toBe(false);
    expect(miss.lesson).toBe(c.lesson);
    expect(fillClient(c.win, 'Rosa')).toContain('Rosa');
  });
  it('a choice pauses on its reaction card, names the client, and Continue follows the tree', () => {
    const { game, state } = makeGame();
    const gig = { title: 'Water Slide Tester', type: 'weird', payout: 100, hours: 1, risk: 0, location: 'safe', hasQTE: false, choiceTree: 'waterSlide', client: 'Otis', clientReliability: 5, isRepeat: false, remote: true };
    state.todayGigs = [gig];
    game.acceptGig(gig);
    expect(game.node.text).toMatch(/water slide/i);
    game.choose(game.node.choices[1]); // safety questions -> follow-up node
    expect(game.node).toBe(null);
    expect(game.pendingOutcome.text).toContain('Otis');
    expect(game.pendingOutcome.lesson).toBeTruthy();
    game.choose(game.node?.choices?.[0] ?? CHOICE_TREES.waterSlide[0].choices[0]); // ignored while the card is up
    expect(game.pendingOutcome).toBeTruthy();
    game.continueOutcome();
    expect(game.node.id).toBe('safetyFollowUp');
    game.choose(game.node.choices[0]);
    game.continueOutcome();
    expect(game.phase).toBe('RESULTS');
    expect(state.lessonsSeen.length).toBe(2);
  });
});

describe('clients have a personality and a memory', () => {
  it('ten clients, each with a first-meeting, happy-return and wary-return line', () => {
    expect(CLIENT_NAMES.length).toBe(10);
    for (const c of CLIENTS) {
      for (const k of ['meet', 'back', 'wary']) {
        expect(c[k], `${c.name}.${k}`).toContain(c.name);
        expect(c[k].length, c[k]).toBeLessThanOrEqual(110);
        expect(c[k].replace(/\{lastJob\}/g, ''), c[k]).not.toMatch(/\{\w+\}/);
      }
    }
  });
  it('the greeting changes with how the last job went', () => {
    const state = {};
    expect(clientGreeting(state, 'Dev')).toBe(CLIENTS.find((c) => c.name === 'Dev').meet);
    rememberClient(state, 'Dev', 'Help Move Furniture', true);
    expect(clientGreeting(state, 'Dev')).toContain('help move furniture');
    rememberClient(state, 'Dev', 'Yard Work — Leaves & Mowing', false);
    expect(clientGreeting(state, 'Dev')).toMatch(/timing this one/);
    expect(state.clientLog.Dev.visits).toBe(2);
    expect(jobNoun('Referral: Dog Walking — Energetic Husky')).toBe('dog walking');
  });
  it('a finished gig is remembered and the next visit opens with it', () => {
    const { game, state } = makeGame();
    const gig = { title: 'Help Move Furniture', type: 'physical', payout: 80, hours: 2, risk: 0, location: 'safe', hasQTE: false, choiceTree: 'movingHelp', client: 'Walt', clientReliability: 5, isRepeat: false, remote: true };
    state.todayGigs = [gig];
    game.acceptGig(gig);
    expect(game.clientGreeting).toMatch(/Walt, a gruff veteran/);
    game.choose(game.node.choices[1]);
    game.continueOutcome();
    expect(state.clientLog.Walt.visits).toBe(1);
    state.todayGigs = [{ ...gig }];
    game.acceptGig(state.todayGigs[0]);
    expect(game.clientGreeting).toMatch(/^Walt (almost smiles|stares)/);
  });
});

describe('every minigame says why', () => {
  it('each microgame and people-skills game carries a short real-world lesson', () => {
    for (const l of [...Object.values(LESSONS), ...Object.values(FEELING_LESSON), ...Object.values(THREAD_LESSON), BREATH_LESSON]) {
      expect(l.length, l).toBeLessThanOrEqual(120);
    }
    for (const g of GIG_TEMPLATES.filter((x) => x.hasQTE)) {
      const m = createQTE(g, CALM);
      for (let t = 0; t < 200 && !m.done; t += DT) m.update(DT, { down: false });
      expect(m.result.lesson, g.title).toBeTruthy();
    }
  });
  it('Read the Client explains the feeling, Text Back explains the method', () => {
    const rc = new ReadClient(null, READ_CLIENT_SCENARIOS[0]);
    rc.picked = 'rushed'; rc.response = rc.s.responses[0]; rc.finish();
    expect(rc.result.lesson).toBe(FEELING_LESSON.rushed);
    const tb = new ThreadGame('client', null, null);
    tb.idx = tb.thread.msgs.length; tb.finish();
    expect(tb.result.lesson).toBe(THREAD_LESSON.client);
  });
});

describe('PACK! scores the heavy-goes-low rule', () => {
  it('a heavy item packed up high still fits, but warns and costs score', () => {
    const low = new PackTheCar(CALM), high = new PackTheCar(CALM);
    for (const g of [low, high]) { g.queue = g.queue.filter((p) => p.label === 'Paint cans'); g.queue[0].w = 2; g.queue[0].h = 1; }
    expect(low.place(0, 2)).toBe(true);   // floor row
    expect(high.place(0, 0)).toBe(true);  // top row
    expect(low.heavyHigh).toBe(0);
    expect(high.heavyHigh).toBe(1);
    expect(high.warn.text).toMatch(/slide/);
    expect(high.result.score).toBeLessThan(low.result.score);
    expect([...HEAVY]).toEqual(['Toolbox', 'Paint cans']);
  });
});

describe('ASSEMBLE!', () => {
  it('the steps in order wins; a wrong step costs time and says which comes first; idle loses', () => {
    const g = new AssembleSteps(CALM, RECIPES[0]);
    const wrong = g.cards.find((c) => c.i === 3);
    g.handleTap({ x: wrong.box.x + 5, y: wrong.box.y + 5 });
    expect(g.mistakes).toBe(1);
    expect(g.flashText).toContain(RECIPES[0].steps[0]);
    for (let i = 0; i < 6; i++) { const c = g.cards.find((x) => x.i === i); g.handleTap({ x: c.box.x + 5, y: c.box.y + 5 }); }
    expect(g.result.success).toBe(true);
    expect(g.result.score).toBeGreaterThan(60);
    const idle = new AssembleSteps(CALM);
    for (let t = 0; t < 60 && !idle.done; t += DT) idle.update(DT);
    expect(idle.result.success).toBe(false);
  });
  it('every recipe has six steps and a reason', () => {
    for (const r of RECIPES) { expect(r.steps.length).toBe(6); expect(r.why.length).toBeLessThanOrEqual(100); }
  });
});

describe('PERCENT!', () => {
  it('right answers win and every answer shows the working; silence loses', () => {
    const g = new PercentTutor(CALM, PERCENT_PROBLEMS.slice(0, 3));
    for (let k = 0; k < 3; k++) {
      g.answer(g.current().answer);
      expect(g.reveal.right).toBe(true);
      for (let t = 0; t < 4 && g.reveal; t += DT) g.update(DT);
    }
    expect(g.result.success).toBe(true);
    expect(g.result.score).toBe(100);
    const idle = new PercentTutor(CALM);
    for (let t = 0; t < 80 && !idle.done; t += DT) idle.update(DT);
    expect(idle.result.success).toBe(false);
  });
  it('the answer is never among the wrong options, and the options are distinct', () => {
    for (const p of PERCENT_PROBLEMS) {
      expect(p.wrong).not.toContain(p.answer);
      expect(new Set([p.answer, ...p.wrong]).size).toBe(3);
      expect(p.why.length).toBeLessThanOrEqual(80);
    }
  });
});

describe('FRAME!', () => {
  it('the rule of thirds: space on the side it faces, center is flat', () => {
    expect(frameVerdict({ facing: 'right' }, 'tl')).toBe('good');
    expect(frameVerdict({ facing: 'right' }, 'br')).toBe('crowded');
    expect(frameVerdict({ facing: 'left' }, 'tr')).toBe('good');
    expect(frameVerdict({ facing: 'up' }, 'bl')).toBe('good');
    expect(frameVerdict({ facing: 'up' }, 'tl')).toBe('crowded');
    expect(frameVerdict({ facing: 'none' }, 'c')).toBe('flat');
    for (const shot of FRAME_SHOTS) expect(FRAME_SPOTS.some((sp) => frameVerdict(shot, sp.id) === 'good'), shot.label).toBe(true);
  });
  it('good placements win; doing nothing loses', () => {
    const g = new FrameShot(CALM, FRAME_SHOTS.slice(0, 3));
    for (let k = 0; k < 3; k++) {
      const spot = FRAME_SPOTS.find((sp) => frameVerdict(g.current(), sp.id) === 'good');
      const p = g.spotPos(spot);
      g.handleTap(p);
      for (let t = 0; t < 4 && g.reveal; t += DT) g.update(DT);
    }
    expect(g.result.success).toBe(true);
    expect(g.result.score).toBe(100);
    const idle = new FrameShot(CALM);
    for (let t = 0; t < 60 && !idle.done; t += DT) idle.update(DT);
    expect(idle.result.success).toBe(false);
  });
});


describe('spaced recall: an earlier takeaway comes back as a question', () => {
  it('every question is about a real lesson, with three distinct options that fit their buttons', () => {
    const lessons = new Set([...Object.values(LESSONS), ...Object.values(FEELING_LESSON), ...Object.values(THREAD_LESSON), BREATH_LESSON, ...allChoices().map(({ c }) => c.lesson)]);
    for (const r of RECALL_BANK) {
      expect(lessons.has(r.lesson), r.q).toBe(true);
      expect(new Set(r.options).size, r.q).toBe(3);
      for (const o of r.options) expect(o.length, o).toBeLessThanOrEqual(40);
      expect(r.q.length, r.q).toBeLessThanOrEqual(80);
    }
  });
  it('only asks about lessons this run has shown, only on recall days, and never twice', () => {
    const state = { day: RECALL_DAYS[0], lessonsSeen: [LESSONS.pack], recallDone: [], stress: 50 };
    expect(recallCard({ ...state, day: 9 })).toBe(null);
    expect(recallCard({ ...state, lessonsSeen: [] })).toBe(null);
    const card = recallCard(state);
    expect(card.text).toMatch(/toolbox/);
    const right = card.choices.find((o) => o.text === 'On the floor, low');
    expect(right.apply(state)).toMatch(/Right/);
    expect(state.stress).toBe(46);
    expect(recallCandidates(state)).toEqual([]);
    const wrong = recallCard({ ...state, recallDone: [] }).choices.find((o) => o.text !== 'On the floor, low');
    expect(wrong.after).toContain('The answer: On the floor, low.');
    expect(wrong.after).toContain(LESSONS.pack);
  });
  it('the morning queue opens with the question, and the answer explains itself once chosen', () => {
    const { game, state } = makeGame({ day: RECALL_DAYS[1], lessonsSeen: [LESSONS.sort] });
    game.beginMorning();
    while (game.ticker.idx < game.ticker.lines.length) game.ticker.idx += 1;
    game.startNextEvent();
    expect(game.activeEvent.label).toBe('REMEMBER THIS?');
    game.chooseEventOption(game.activeEvent.choices[0]);
    expect(game.activeEvent.subtext).toContain(LESSONS.sort);
    expect(state.recallDone).toEqual([LESSONS.sort]);
  });
});
