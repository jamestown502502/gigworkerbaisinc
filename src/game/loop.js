// State machine: MORNING → BROWSE → TRAVEL → GIG → RESULTS (loop) → EVENING (+ EVENING_GAME)
// → sleep → MORNING ... → SUMMARY on day 30 (+ GAMEOVER on eviction).
import { InputManager } from '../engine/input.js';
import * as audio from '../engine/audio.js';
import { RUN_LENGTH_DAYS } from '../engine/state.js';
import { generateDailyGigs, gigEnergyCost, travelCost, makeReferralGig } from './gigs.js';
import { getNode, resolveChoice } from './choices.js';
import { createQTE, createEIGame, createEveningGame, QTE_READY_DURATION } from './qte.js';
import { rollDailyEvents, generateMorningFlavor } from './events.js';
import { rollWeather } from './weather.js';
import { UI } from '../ui/screens.js';
import * as screens from '../ui/screens.js';
import { renderHUD } from '../ui/hud.js';
import { renderListings } from '../ui/listings.js';
import { TUTORIAL_STEPS, renderTutorial } from '../ui/tutorial.js';
import { spawnBurst, spawnFloatingText, triggerShake, triggerTint, getShakeOffset, updateFX, renderFX, renderTint } from '../ui/fx.js';
import { createTransition, stepTransition, renderTransition } from '../ui/transition.js';

export const UPGRADES = [
  { name: 'Better Shoes', cost: 50, effect: 'Travel costs -1 energy', apply: (state) => { state.energyPerTravel = Math.max(1, (state.energyPerTravel || 3) - 1); } },
  { name: 'Tool Belt', cost: 80, effect: 'Physical gigs pay +30%', apply: (state) => { state.hasToolBelt = true; } },
  { name: 'Laptop', cost: 200, effect: 'Remote creative gigs, no travel', apply: (state) => { state.hasLaptop = true; } },
  { name: 'Bike', cost: 120, effect: 'Travel costs 1 energy', apply: (state) => { state.hasBike = true; state.energyPerTravel = 1; } },
  { name: 'Phone Upgrade', cost: 60, effect: 'See client reliability rating', apply: (state) => { state.canSeeReliability = true; } },
  { name: 'Work Gloves', cost: 30, effect: '-5 energy cost on physical gigs', apply: (state) => { state.hasGloves = true; } },
  { name: 'Sturdy Leash', cost: 15, effect: 'Unlocks a dog-walking option', apply: (state) => { state.inventory.push('leash'); } },
];

// Consumables: bought any time, never "owned". Groceries exist because the Morning screen said
// "Hungry" while the shop sold nothing to eat (QA #20).
export const CONSUMABLES = [
  { name: 'Groceries', cost: 18, effect: 'Eat properly today: clears Hungry, +5 energy',
    canBuy: (s) => s.groceriesDay !== s.day,
    apply: (s) => { s.hungry = false; s.groceriesDay = s.day; s.ateYesterday = true; s.energy = Math.min(100, s.energy + 5); } },
];

export const RENT = 600, PHONE = 40, FOOD = 50;

export const EVENING_OPTIONS = [
  { id: 'winddown', label: 'Wind down', desc: 'A few minutes of breathing. Lowers stress, eases tomorrow\'s timed challenges.' },
  { id: 'checkin', label: 'Call someone', desc: 'Check in on a friend or family. Builds your support network.' },
  { id: 'hustle', label: 'Late side hustle', desc: '+$20-40 tonight. -10 energy, +8 stress, and you wake up tired.' },
];

// Health ("Balance" in the HUD) decay, applied on wake-up
export function applyHealthDecay(s) {
  if (!s.ateYesterday) s.health -= 5;                       // skipped food
  if (s.stress > 70) s.health -= s.support >= 50 ? 1 : 3;   // chronic stress — a support network softens it
  if (s.coldDays > 0) {                                     // sickness recovery
    s.coldDays--;
    s.health -= 5;
    if (s.coldDays === 0) s.health += 10;
  }
  if (s.energy > 80 && s.health < 100) s.health += 2;      // natural recovery
  s.health = Math.max(0, Math.min(100, s.health));
}

/** Sleep recovery: base by hunger, scaled by Balance in three bands, then the evening's modifiers. */
export function sleepRecovery(s) {
  const base = s.hungry ? 25 : 45;
  const mult = s.health >= 70 ? 1.2 : s.health < 40 ? 0.7 : 1;
  return Math.round(base * mult + 1e-6);
}

export class Game {
  constructor(state) {
    this.state = state;
    this.phase = 'MORNING';
    this.transition = null;
    this.currentGig = null;
    this.node = null;
    this.qte = null;
    this.qteKind = null;     // 'skill' | 'ei' | 'evening'
    this.eiNext = null;      // choice-tree node to continue to after an in-gig EI game
    this.travelT = 0;
    this.results = null;
    this.resultsT = 0;
    this.listScroll = 0;
    this.listScrollPx = 0;
    this.selectedGig = null;
    this.shopOpen = false;
    this.billsOpen = false;
    this.billsPaid = {};
    this.wrapUpOpen = false;
    this.message = '';
    this.restDay = false;
    this.settingsOpen = false;
    this.confirmReset = false;
    this.hudTooltip = null;
    this.hudTooltipT = 0;
    this.qteFxFired = false;
    this.qteEndTimer = 0;
    this.qteReadyT = 0;
    this.eveningOutcome = '';
    this.ping = null;        // late-night gig ping (boundary decision)
    this.repShown = state.reputation;
    this.ctx = null;
    // Morning intro state. On mid-day reload we start "ready" (no re-rolled
    // events); ticker/events only play on a fresh morning via beginMorning().
    this.ticker = { lines: [], idx: 0, t: 0 };
    this.eventQueue = [];
    this.activeEvent = null;
    this.eventOutcome = '';
    this.eventT = 0;
    if (!state.weather) state.weather = rollWeather();
    if (!state.todayGigs || state.todayGigs.length === 0) {
      state.todayGigs = generateDailyGigs(state);
    }
    state.save();
    if (state.rentOverdueDays >= 14) this.phase = 'GAMEOVER';
    else if (state.runComplete && !state.freePlay) this.phase = 'SUMMARY';
  }

  // ---------- phase changes ----------

  /** Every phase change goes through here so it can carry a transition. `kind` null = instant. */
  setPhase(next, kind = null, meta = {}) {
    const apply = () => { this.phase = next; };
    if (!kind) { apply(); return; }
    const reduceMotion = !!this.state.settings?.reduceMotion;
    if (this.transition) { this.transition.apply = apply; this.transition.applied = false; return; }
    this.transition = createTransition(kind, apply, { reduceMotion, meta });
  }

  // ---------- morning intro (ticker + events) ----------

  get morningReady() {
    return this.ticker.idx >= this.ticker.lines.length && !this.activeEvent && this.eventQueue.length === 0;
  }

  beginMorning() {
    const s = this.state;
    this.shopOpen = false;
    this.eveningOutcome = '';
    this.ping = null;
    // release funds frozen by yesterday's payment dispute
    if (s.heldCash > 0) {
      s.cash += s.heldCash;
      this.message = `Dispute resolved — $${s.heldCash} released back to you.`;
      s.heldCash = 0;
    }
    // reset one-day event modifiers
    s.listingsLockedToday = false;
    s.eventTravelMod = 0;
    s.eventOutdoorEnergyMod = 0;
    // forced rest day at zero balance
    this.restDay = false;
    if (s.health <= 0) {
      this.restDay = true;
      s.health = Math.min(100, s.health + 20);
      this.ticker = { lines: [], idx: 0, t: 0 };
      this.eventQueue = [];
      this.activeEvent = null;
      s.save();
      return;
    }
    // tutorial morning stays clean: no ticker, no events
    const inTutorial = !s.tutorialSeen;
    this.ticker = { lines: inTutorial ? [] : generateMorningFlavor(s, s.weather), idx: 0, t: 0 };
    this.eventQueue = inTutorial ? [] : rollDailyEvents(s);
    this.activeEvent = null;
    this.eventOutcome = '';
    if (this.eventQueue.some((e) => e.effect || e.choices)) s.weekStats.daysWithEvents += 1;
    s.save();
  }

  startNextEvent() {
    this.eventT = 0;
    this.eventOutcome = '';
    const e = this.eventQueue.shift() || null;
    this.activeEvent = e ? { ...e } : null;
    if (e && e.tier === 3) audio.playSting();     // crisis lands with weight
    if (e && e.effect) {
      this.eventOutcome = e.effect(this.state) || '';
      this.state.clamp();
      this.state.save();
    }
  }

  chooseEventOption(opt) {
    this.eventOutcome = opt.apply(this.state) || '';
    this.activeEvent = { ...this.activeEvent, choices: null, resolved: true };
    this.eventT = 0;
    this.state.clamp();
    this.state.save();
  }

  // ---------- tutorial ----------

  tutorialVisible() {
    if (this.state.tutorialSeen) return false;
    const step = TUTORIAL_STEPS[this.state.tutorialStep];
    return !!step && step.phase === this.phase;
  }

  replayTutorial() {
    this.state.tutorialSeen = false;
    this.state.tutorialStep = 0;
    this.settingsOpen = false;
    this.state.save();
  }

  // ---------- transitions between phases ----------

  goBrowse() {
    const s = this.state;
    if (this.restDay) { this.message = "You're too sick to work today."; return; }
    if (s.phoneCut) { this.message = 'Phone service is cut — pay the bill to see listings.'; return; }
    if (s.listingsLockedToday) { this.message = 'Your phone is dead. No listings today.'; return; }
    this.selectedGig = null;
    this.listScroll = 0;
    this.listScrollPx = 0;
    this.message = '';
    this.setPhase('BROWSE', 'phone');
  }

  /** Energy is a hard gate at accept time: travel + the gig's base cost (QA #1). */
  canAffordGig(gig) {
    const s = this.state;
    const need = travelCost(gig, s) + gigEnergyCost(gig, s);
    if (s.energy < need) return { ok: false, reason: `Not enough energy — this needs ${need}, you have ${Math.round(s.energy)}.` };
    if (gig.hours > s.hoursLeft) return { ok: false, reason: `Not enough hours left today (${gig.hours}h needed, ${s.hoursLeft}h left).` };
    return { ok: true, need };
  }

  acceptGig(gig) {
    const check = this.canAffordGig(gig);
    if (!check.ok) { this.message = check.reason; audio.playError(); return false; }
    this.currentGig = gig;
    audio.playAccept();
    spawnBurst(310, 552, { color: '#ffd700' });   // burst at the Accept button
    this.snapshot = { cash: this.state.cash, stress: this.state.stress, rep: this.state.reputation, energy: this.state.energy };
    this.outcomeTexts = [];
    this.state.todayGigs = this.state.todayGigs.filter((g) => g !== gig);
    if (gig.remote) {
      this.message = 'Working remotely — no travel needed.';
      this.startGig();
    } else {
      this.state.energy -= travelCost(gig, this.state);
      this.state.clamp();
      this.travelT = 0;
      this.setPhase('TRAVEL', 'commute');
    }
    this.state.save();
    return true;
  }

  startGig() {
    this.qte = null;
    this.qteKind = null;
    this.setPhase('GIG', 'doorway');
    this.enterNode(getNode(this.currentGig.choiceTree, 0));
  }

  /** A node with `minigame` runs that EI game before continuing to `next`. */
  enterNode(node) {
    if (!node) { this.node = null; this.afterChoices(); return; }
    if (node.minigame) {
      this.node = null;
      this.qte = createEIGame(node.minigame, this.state);
      this.qteKind = 'ei';
      this.eiNext = node.next;
      this.qteReadyT = 0;
      this.qteEndTimer = 0;
      return;
    }
    this.node = node;
  }

  choose(choice) {
    const { outcomeText } = resolveChoice(this.state, choice);
    this.outcomeTexts.push(`${choice.text} — ${outcomeText}`);
    if (choice.next) this.enterNode(getNode(this.currentGig.choiceTree, choice.next));
    else this.afterChoices();
  }

  afterChoices() {
    this.node = null;
    if (this.currentGig.hasQTE) {
      this.qte = createQTE(this.currentGig, this.state);
      this.qteKind = 'skill';
      this.qteFxFired = false;
      this.qteEndTimer = 0;
      this.qteReadyT = 0; // brief "GET READY" beat before input goes live — see update()
    } else {
      this.finishGig(null);
    }
  }

  finishEIGame(result) {
    const s = this.state;
    const fx = result.effects || {};
    s.reputation += fx.rep || 0;
    s.stress += fx.stress || 0;
    s.cash += fx.cash || 0;
    s.clamp();
    if (result.success) { s.eiWins += 1; triggerTint('#2ecc71', 0.2); } else triggerShake(5, 0.2);
    this.outcomeTexts.push(result.summary || (result.success ? 'You read the room.' : 'You misread the room.'));
    this.qte = null;
    this.qteKind = null;
    this.qteEndTimer = 0;
    // Reading people has a visible economic payoff: the client is far likelier to become a regular.
    if (result.success && !this.currentGig.isRepeat && !s.repeatClients.includes(this.currentGig.client) && Math.random() < 0.5) {
      s.repeatClients.push(this.currentGig.client);
      this.outcomeTexts.push(`${this.currentGig.client} asks for your number. New regular.`);
    }
    const next = this.eiNext;
    this.eiNext = null;
    if (next) this.enterNode(getNode(this.currentGig.choiceTree, next));
    else this.afterChoices();
    s.save();
  }

  /** One ledger for the whole gig. Every line is applied to state in order and the headline is
   *  their sum — so the headline, the itemized breakdown, and the real change in cash can never
   *  disagree (QA #3 / #7, where the headline showed the post-penalty payout while the cash
   *  delta also included choice-tree money). */
  finishGig(qteResult) {
    const s = this.state;
    const gig = this.currentGig;
    s.energy -= gigEnergyCost(gig, s);
    s.hoursLeft -= gig.hours;

    const items = [];
    const base = gig.payout;
    items.push({ label: gig.title, amount: base });
    let payout = base;
    if (qteResult) {
      if (qteResult.success) {
        const bonus = Math.round(base * (qteResult.score / 500));
        if (bonus > 0) items.push({ label: `Challenge bonus (score ${qteResult.score})`, amount: bonus });
        payout += bonus;
        s.reputation += 0.1;
      } else {
        const cut = Math.round(base * 0.3);
        items.push({ label: 'Fumbled the challenge (-30%)', amount: -cut });
        payout -= cut;
        s.reputation -= 0.2;
        s.stress += 10;
        spawnFloatingText(229, 20, '+stress', { color: '#e74c3c', size: 14 });
      }
    }

    // scam roll — risk% chance the client stiffs you, worse with flaky clients
    let scamText = '';
    const scamChance = gig.risk * (gig.clientReliability <= 2 ? 1.5 : 1) * (gig.isRepeat ? 0.5 : 1);
    if (Math.random() * 100 < scamChance) {
      const kept = Math.random() * 0.5;
      const lost = payout - Math.round(payout * kept);
      if (lost > 0) items.push({ label: kept < 0.1 ? 'Client vanished without paying' : 'Client short-changed you', amount: -lost });
      payout -= lost;
      s.stress += 15;
      scamText = kept < 0.1 ? 'The client vanished without paying. Scammed!' : 'The client short-changed you with a shrug.';
      audio.playStress();
      triggerShake(7, 0.28);
      triggerTint('#e74c3c', 0.3);
    }

    // steady-work event: double pay
    if (s.doublePayDays > 0 && payout > 0) {
      items.push({ label: 'Steady contract ×2', amount: payout });
      payout *= 2;
      this.outcomeTexts.push('Steady contract: payout doubled!');
    }

    // Money that changed hands during the job (choice-tree / EI effects already applied to state)
    const onTheJob = Math.round(s.cash - this.snapshot.cash);
    if (onTheJob !== 0) items.push({ label: onTheJob > 0 ? 'Extra on the job' : 'Spent on the job', amount: onTheJob });

    s.cash += payout;
    s.totalEarned += payout;
    s.gigsCompleted += 1;
    s.weekStats.gigsDone += 1;
    s.weekStats.totalEarned += payout;
    s.reputation += 0.05;
    if (gig.location === 'sketchy') s.stress += 5;
    if (s.reputation >= 3 && !gig.isRepeat && Math.random() < 0.3 && !s.repeatClients.includes(gig.client)) {
      s.repeatClients.push(gig.client);
    }
    s.gigHistory.push({ day: s.day, title: gig.title, payout });
    s.clamp();

    const total = items.reduce((a, i) => a + i.amount, 0);
    this.results = {
      payout,
      total,
      items,
      scamText,
      qteResult,
      outcomeTexts: this.outcomeTexts,
      deltas: {
        cash: Math.round(s.cash - this.snapshot.cash),
        stress: s.stress - this.snapshot.stress,
        rep: s.reputation - this.snapshot.rep,
        energy: s.energy - this.snapshot.energy,
      },
    };
    this.resultsT = 0;
    this.qte = null;
    this.qteKind = null;
    this.setPhase('RESULTS', 'receipt');
    if (total > 0) {
      audio.playCashIn();
      spawnBurst(400, 182, { color: '#2ecc71', count: 18 });
      spawnFloatingText(400, 160, `+$${total}`, { color: '#2ecc71', size: 20 });
    }
    if (s.reputation > this.snapshot.rep) {
      spawnBurst(344, 28, { color: '#f1c40f', count: 10, speed: 70 });
    }
    if (s.energy <= 0) this.message = "You're completely spent. That's the day.";
    s.save();
  }

  continueFromResults() {
    this.results = null;
    const s = this.state;
    const canBrowse = !s.phoneCut && !s.listingsLockedToday;
    if (canBrowse && s.hoursLeft >= 1 && s.energy >= 8 && s.todayGigs.length > 0) {
      this.goBrowse();
    } else {
      this.message = s.energy < 8 ? "You're completely spent. Time to head home." : '';
      this.goEvening();
    }
  }

  goEvening() {
    const s = this.state;
    this.shopOpen = false;
    if (s.daysUntilBills <= 0) {
      this.billsOpen = true;
      this.billsPaid = { rent: false, phone: false, food: false };
    }
    // A late-night ping: someone wants you at 6 a.m. tomorrow. Whether you take it is the
    // work-life-balance beat — the modal shows tomorrow's energy either way.
    if (!this.restDay && s.day >= 3 && s.eveningDoneDay !== s.day && !this.ping && Math.random() < 0.35) {
      const gig = makeReferralGig(s);
      gig.title = 'Early call: ' + gig.title.replace('Referral: ', '');
      gig.description = 'They need you at 6 a.m. sharp.';
      this.ping = { gig, resolved: false, text: '' };
    }
    if (this.phase !== 'EVENING') this.setPhase('EVENING', 'dusk');
  }

  backFromEvening() {
    if (this.billsOpen || this.wrapUpOpen || this.restDay) return;
    this.message = '';
    this.setPhase('MORNING', 'fade');
  }

  resolvePing(choice) {
    const s = this.state;
    const p = this.ping;
    if (!p || p.resolved) return;
    if (choice === 'accept') {
      s.lateGigTomorrow = p.gig;
      s.tiredTomorrow = true;
      p.text = `You take it. $${p.gig.payout} on tomorrow's board, but you'll wake up 15 energy short.`;
    } else if (choice === 'counter') {
      if (Math.random() < 0.55) {
        p.gig.payout = Math.round(p.gig.payout * 1.2);
        p.gig.description = 'Moved to 9 a.m. at your rate.';
        s.lateGigTomorrow = p.gig;
        p.text = `They agree to 9 a.m. at +20%. $${p.gig.payout} on tomorrow's board, no early alarm.`;
        s.reputation += 0.1;
      } else {
        p.text = 'They pass. Someone else will take the 6 a.m. Your evening stays yours.';
      }
    } else {
      s.energy = Math.min(100, s.energy + 5);
      s.health += 2;
      p.text = 'You say no. It feels strange, then it feels good. +5 energy, +2 balance.';
    }
    p.resolved = true;
    s.clamp();
    s.save();
  }

  /** Evening choice: one per evening. 'winddown' and 'checkin' open a minigame; 'hustle' is instant. */
  eveningChoice(id) {
    const s = this.state;
    if (s.eveningDoneDay === s.day || this.billsOpen || this.wrapUpOpen) return;
    if (id === 'hustle') {
      const cash = 20 + Math.floor(Math.random() * 21);
      s.cash += cash; s.totalEarned += cash; s.weekStats.totalEarned += cash;
      s.stress += 8; s.energy -= 10; s.health -= 3; s.tiredTomorrow = true;
      s.eveningDoneDay = s.day;
      s.clamp();
      this.eveningOutcome = `Late hustle: +$${cash}. You'll feel it in the morning.`;
      audio.playCashIn();
      spawnFloatingText(580, 300, `+$${cash}`, { color: '#2ecc71', size: 20 });
      s.save();
      return;
    }
    this.qte = createEveningGame(id === 'checkin' ? 'checkin' : 'breathe');
    this.qteKind = 'evening';
    this.qteReadyT = 0;
    this.qteEndTimer = 0;
    this.setPhase('EVENING_GAME', 'doorway');
  }

  finishEveningGame(result) {
    const s = this.state;
    const fx = result.effects || {};
    if (this.qte && this.qte.name === 'WIND DOWN') {
      const relief = 8 + Math.round((result.score / 100) * 12);
      s.stress -= relief;
      s.health += 3;
      s.calmTonight = true;
      s.eveningsRested += 1;
      s.weekStats.eveningsRested += 1;
      this.eveningOutcome = `You breathe. -${relief} stress, +3 balance. Tomorrow's timed challenges will feel easier.`;
    } else {
      s.support += fx.support || 0;
      s.stress += fx.stress || 0;
      s.health += 2;
      s.eveningsRested += 1;
      s.weekStats.eveningsRested += 1;
      this.eveningOutcome = `${result.summary} Support +${fx.support || 0}.`;
    }
    s.eveningDoneDay = s.day;
    s.clamp();
    this.qte = null;
    this.qteKind = null;
    this.setPhase('EVENING', 'fade');
    audio.playWarm();
    s.save();
  }

  billAmount(kind) {
    const s = this.state;
    if (kind === 'rent') return RENT + s.unpaidRent;
    if (kind === 'phone') return PHONE + s.unpaidPhone;
    return FOOD;
  }

  payBill(kind) {
    const s = this.state;
    const amt = this.billAmount(kind);
    if (s.cash < amt || this.billsPaid[kind]) return;
    s.cash -= amt;
    this.billsPaid[kind] = true;
    if (kind === 'rent') { s.unpaidRent = 0; s.rentOverdueDays = 0; }
    if (kind === 'phone') { s.unpaidPhone = 0; s.phoneCut = false; }
    audio.playCashOut();
    s.save();
  }

  closeBills() {
    const s = this.state;
    if (!this.billsPaid.rent) s.unpaidRent += RENT;
    if (!this.billsPaid.phone) { s.unpaidPhone += PHONE; s.phoneCut = true; }
    s.hungry = !this.billsPaid.food;
    s.daysUntilBills = 7;
    this.billsOpen = false;
    this.wrapUpOpen = true;   // weekly wrap-up follows bills
    s.save();
  }

  finishWrapUp() {
    const s = this.state;
    this.wrapUpOpen = false;
    s.weekNumber += 1;
    s.weekStats = { startingCash: s.cash, gigsDone: 0, totalEarned: 0, daysWithEvents: 0, eveningsRested: 0 };
    // rotate the repeat-client pool weekly: ~30% stay loyal, the rest must be re-won
    s.repeatClients = s.repeatClients.filter(() => Math.random() < 0.3);
    s.save();
  }

  payDebt(kind) {
    const s = this.state;
    let paid = 0;
    if (kind === 'rent' && s.cash >= s.unpaidRent && s.unpaidRent > 0) {
      paid = s.unpaidRent;
      s.cash -= s.unpaidRent; s.unpaidRent = 0; s.rentOverdueDays = 0;
    }
    if (kind === 'phone' && s.cash >= s.unpaidPhone && s.unpaidPhone > 0) {
      paid = s.unpaidPhone;
      s.cash -= s.unpaidPhone; s.unpaidPhone = 0; s.phoneCut = false;
    }
    if (paid > 0) {
      audio.playCashOut();
      this.message = kind === 'rent' ? `Overdue rent paid. The eviction clock stops.` : 'Phone bill paid. Listings are back.';
      spawnFloatingText(485, 360, `-$${paid}`, { color: '#ff6b5e', size: 18 });
    }
    s.save();
  }

  buyUpgrade(up) {
    const s = this.state;
    if (s.cash < up.cost) return;
    if (up.canBuy) {
      if (!up.canBuy(s)) return;
      s.cash -= up.cost;
      up.apply(s);
    } else {
      if (s.upgradesOwned.includes(up.name)) return;
      s.cash -= up.cost;
      s.upgradesOwned.push(up.name);
      up.apply(s);
    }
    audio.playCashOut();
    s.save();
  }

  sleep() {
    const s = this.state;
    if (this.billsOpen || this.wrapUpOpen) return;
    // Day 30 is the run. The summary comes first; Free Play is an explicit choice (QA #4).
    if (!s.freePlay && s.day >= RUN_LENGTH_DAYS) {
      s.runComplete = true;
      s.save();
      this.setPhase('SUMMARY', 'paper');
      return;
    }
    const fromDay = s.day;
    s.day += 1;
    s.daysUntilBills -= 1;
    if (s.unpaidRent > 0) s.rentOverdueDays += 1;
    applyHealthDecay(s);
    s.ateYesterday = !s.hungry;
    s.energy = Math.min(100, s.energy + sleepRecovery(s));
    if (s.tiredTomorrow) { s.energy = Math.max(10, s.energy - 15); s.tiredTomorrow = false; }
    s.calm = !!s.calmTonight;
    s.calmTonight = false;
    s.stress = Math.max(0, s.stress - 8);
    s.hoursLeft = 12;
    if (s.doublePayDays > 0) s.doublePayDays -= 1;
    s.weather = rollWeather();
    s.todayGigs = generateDailyGigs(s);
    if (s.lateGigTomorrow) { s.todayGigs.unshift(s.lateGigTomorrow); s.lateGigTomorrow = null; }
    this.message = '';
    if (s.rentOverdueDays >= 14) {
      this.setPhase('GAMEOVER', 'fade');
      s.save();
      return;
    }
    this.beginMorning();
    this.setPhase('MORNING', 'sunrise', { fromDay, toDay: s.day });
    s.save();
  }

  startFreePlay() {
    this.state.freePlay = true;
    this.state.save();
    this.phase = 'EVENING';
    this.sleep();
  }

  newGame() {
    this.state.reset();
    this.state.weather = rollWeather();
    this.state.todayGigs = generateDailyGigs(this.state);
    this.state.save();
    this.message = '';
    this.currentGig = null;
    this.results = null;
    this.qte = null;
    this.qteKind = null;
    this.restDay = false;
    this.billsOpen = false;
    this.wrapUpOpen = false;
    this.settingsOpen = false;
    this.confirmReset = false;
    this.ping = null;
    this.eveningOutcome = '';
    this.ticker = { lines: [], idx: 0, t: 0 };
    this.eventQueue = [];
    this.activeEvent = null;
    this.repShown = this.state.reputation;
    this.setPhase('MORNING', 'sunrise', { fromDay: 0, toDay: 1 });
  }

  // ---------- frame ----------

  update(dt) {
    updateFX(dt);
    if (this.transition) {
      if (stepTransition(this.transition, dt)) this.transition = null;
      return; // the world holds still under the cover
    }
    if (this.hudTooltip) {
      this.hudTooltipT += dt;
      if (this.hudTooltipT > 3) { this.hudTooltip = null; this.hudTooltipT = 0; }
    }
    // Reputation feedback: any move of a quarter star or more is called out at the HUD stars.
    const repDelta = this.state.reputation - this.repShown;
    if (Math.abs(repDelta) >= 0.25) {
      spawnFloatingText(330, 30, `${repDelta > 0 ? '+' : ''}${repDelta.toFixed(1)} ★`, { color: repDelta > 0 ? '#f1c40f' : '#e74c3c', size: 16 });
      this.repShown = this.state.reputation;
    } else if (Math.abs(repDelta) > 0 && Math.abs(repDelta) < 0.25) {
      this.repShown += repDelta * Math.min(1, dt * 4);
    }
    if (this.phase === 'MORNING' && !this.tutorialVisible()) {
      if (this.ticker.idx < this.ticker.lines.length) {
        this.ticker.t += dt;
        if (this.ticker.t >= 3) { this.ticker.idx += 1; this.ticker.t = 0; }
      } else if (!this.activeEvent && this.eventQueue.length > 0) {
        this.startNextEvent();
      } else if (this.activeEvent) {
        this.eventT += dt;   // drives the modal fade-in; events now wait for a tap (QA #24)
      }
    }
    if (this.phase === 'TRAVEL') {
      this.travelT = Math.min(2, this.travelT + dt);
    }
    if ((this.phase === 'GIG' || this.phase === 'EVENING_GAME') && this.qte && !this.tutorialVisible()) {
      // A short "GET READY" beat before a skill QTE springs on the player. Conversational games skip it.
      if (this.qteKind === 'skill' && this.qteReadyT < QTE_READY_DURATION) {
        this.qteReadyT += dt;
      } else {
        this.qte.update(dt);
        if (this.qte.done && this.qteKind === 'skill' && !this.qteFxFired) {
          this.qteFxFired = true;
          if (this.qte.result.success) triggerTint('#2ecc71', 0.22);
          else { triggerShake(8, 0.3); triggerTint('#e74c3c', 0.28); }
        }
        if (this.qte.done) {
          const result = this.qte.result;
          this.qteEndTimer += dt;
          if (this.qteEndTimer > 0.8) {
            this.qteEndTimer = 0;
            if (this.qteKind === 'skill') this.finishGig(result);
            else if (this.qteKind === 'ei') this.finishEIGame(result);
            else this.finishEveningGame(result);
          }
        }
      }
    }
    if (this.phase === 'RESULTS') {
      this.resultsT += dt;
    }
  }

  render(ctx) {
    this.ctx = ctx;
    UI.begin();
    const off = getShakeOffset();
    ctx.save();
    ctx.translate(off.x, off.y);
    ctx.clearRect(-10, -10, 820, 620); // slightly oversized to cover the shake offset at the edges

    switch (this.phase) {
      case 'MORNING': screens.apartmentScreen(ctx, this); break;
      case 'BROWSE': renderListings(ctx, this); break;
      case 'TRAVEL': screens.travelScreen(ctx, this); break;
      case 'GIG': screens.gigScreen(ctx, this); break;
      case 'RESULTS': screens.resultsScreen(ctx, this); break;
      case 'EVENING': screens.eveningScreen(ctx, this); break;
      case 'EVENING_GAME': screens.eveningGameScreen(ctx, this); break;
      case 'SUMMARY': screens.summaryScreen(ctx, this); break;
      case 'GAMEOVER': screens.gameOverScreen(ctx, this); break;
    }

    if (this.phase !== 'GAMEOVER' && this.phase !== 'SUMMARY') renderHUD(ctx, this);
    if (this.settingsOpen) screens.settingsModal(ctx, this);
    renderFX(ctx);
    if (this.tutorialVisible()) renderTutorial(ctx, this);
    ctx.restore();
    renderTint(ctx); // screen-space wash, drawn outside the shake translate on purpose
    if (this.transition) { renderTransition(ctx, this.transition); UI.begin(); } // nothing is tappable mid-transition

    this.processInput();
  }

  processInput() {
    const s = this.state;
    // drags / wheel feed whichever screen wants them (listings, sliders read InputManager directly)
    let click;
    while ((click = InputManager.consumeClick())) {
      if (this.transition) continue;
      // tutorial overlay consumes clicks and advances (or skips entirely)
      if (this.tutorialVisible()) {
        const r = this.tutorialSkipRect;
        if (r && click.x >= r[0] && click.x <= r[0] + r[2] && click.y >= r[1] && click.y <= r[1] + r[3]) {
          s.tutorialSeen = true;
          this.beginMorning();   // skipping hands them a real morning (ticker + events)
        } else {
          s.tutorialStep += 1;
          if (s.tutorialStep >= TUTORIAL_STEPS.length) s.tutorialSeen = true;
        }
        s.save();
        audio.playClick();
        continue;
      }
      // morning intro: real buttons first (debt quick-pay, customizer, gear), then a tap on
      // empty space skips a ticker line or dismisses a choice-less event (QA #10, #24)
      if (this.phase === 'MORNING' && !this.morningReady) {
        if (UI.handleClick(click)) { audio.playClick(); continue; }
        if (this.ticker.idx < this.ticker.lines.length) { this.ticker.idx += 1; this.ticker.t = 0; continue; }
        if (this.activeEvent && !this.activeEvent.choices) { this.startNextEvent(); continue; }
        continue;
      }
      if ((this.phase === 'GIG' || this.phase === 'EVENING_GAME') && this.qte && !this.qte.done && !this.settingsOpen) {
        if (this.qteKind !== 'skill' || this.qteReadyT >= QTE_READY_DURATION) this.qte.handleTap(click);
        // the HUD gear still works mid-game so the player is never trapped without settings
        if (click.y < 56 && click.x > 700) UI.handleClick(click);
        continue; // still swallow the tap during the ready beat — it shouldn't fall through to UI
      }
      if (UI.handleClick(click)) audio.playClick();
    }
  }

  /** Test helper: advance N seconds in fixed 60 Hz ticks, rendering (and so processing input)
   *  each tick. The in-app browser throttles requestAnimationFrame, so e2e drives time by hand. */
  step(seconds = 1 / 60) {
    const ticks = Math.max(1, Math.round(seconds * 60));
    for (let i = 0; i < ticks; i++) {
      this.update(1 / 60);
      if (this.ctx) this.render(this.ctx);
    }
  }

  /** Test helper: queue a tap at logical coordinates and process it. */
  tap(x, y) {
    InputManager.clicks.push({ x, y, type: 'click' });
    this.step(2 / 60);
  }
}
