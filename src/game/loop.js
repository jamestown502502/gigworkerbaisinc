// State machine: MORNING → BROWSE → TRAVEL → GIG → EVENING (+ RESULTS, GAMEOVER)
import { InputManager } from '../engine/input.js';
import * as audio from '../engine/audio.js';
import { generateDailyGigs, gigEnergyCost, travelCost } from './gigs.js';
import { getNode, resolveChoice } from './choices.js';
import { createQTE } from './qte.js';
import { rollDailyEvents, generateMorningFlavor } from './events.js';
import { rollWeather } from './weather.js';
import { UI } from '../ui/screens.js';
import * as screens from '../ui/screens.js';
import { renderHUD } from '../ui/hud.js';
import { renderListings } from '../ui/listings.js';
import { TUTORIAL_STEPS, renderTutorial } from '../ui/tutorial.js';
import { spawnBurst, updateFX, renderFX } from '../ui/fx.js';

export const UPGRADES = [
  { name: 'Better Shoes', cost: 50, effect: 'Travel costs -1 energy', apply: (state) => { state.energyPerTravel = Math.max(1, (state.energyPerTravel || 3) - 1); } },
  { name: 'Tool Belt', cost: 80, effect: 'Physical gigs pay +30%', apply: (state) => { state.hasToolBelt = true; } },
  { name: 'Laptop', cost: 200, effect: 'Remote creative gigs, no travel', apply: (state) => { state.hasLaptop = true; } },
  { name: 'Bike', cost: 120, effect: 'Travel costs 1 energy', apply: (state) => { state.hasBike = true; state.energyPerTravel = 1; } },
  { name: 'Phone Upgrade', cost: 60, effect: 'See client reliability rating', apply: (state) => { state.canSeeReliability = true; } },
  { name: 'Work Gloves', cost: 30, effect: '-5 energy cost on physical gigs', apply: (state) => { state.hasGloves = true; } },
  { name: 'Sturdy Leash', cost: 15, effect: 'Unlocks a dog-walking option', apply: (state) => { state.inventory.push('leash'); } },
];

const RENT = 600, PHONE = 40, FOOD = 50;

// Health decay, applied on wake-up (Step 3)
function applyHealthDecay(s) {
  if (!s.ateYesterday) s.health -= 5;      // skipped food
  if (s.stress > 70) s.health -= 3;        // chronic stress
  if (s.coldDays > 0) {                    // sickness recovery
    s.coldDays--;
    s.health -= 5;
    if (s.coldDays === 0) s.health += 10;
  }
  if (s.energy > 80 && s.health < 100) s.health += 2;  // natural recovery
  s.health = Math.max(0, Math.min(100, s.health));
}

export class Game {
  constructor(state) {
    this.state = state;
    this.phase = 'MORNING';
    this.currentGig = null;
    this.node = null;
    this.qte = null;
    this.travelT = 0;
    this.results = null;
    this.resultsT = 0;
    this.listScroll = 0;
    this.selectedGig = null;
    this.shopOpen = false;
    this.billsOpen = false;
    this.billsPaid = {};
    this.wrapUpOpen = false;
    this.message = '';
    this.bgmStarted = false;
    this.restDay = false;
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
  }

  // ---------- morning intro (ticker + events) ----------

  get morningReady() {
    return this.ticker.idx >= this.ticker.lines.length && !this.activeEvent && this.eventQueue.length === 0;
  }

  beginMorning() {
    const s = this.state;
    this.phase = 'MORNING';
    this.shopOpen = false;
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
    // forced rest day at zero health
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

  // ---------- transitions ----------

  goBrowse() {
    const s = this.state;
    if (this.restDay) { this.message = "You're too sick to work today."; return; }
    if (s.phoneCut) { this.message = 'Phone service is cut — pay the bill to see listings.'; return; }
    if (s.listingsLockedToday) { this.message = 'Your phone is dead. No listings today.'; return; }
    this.selectedGig = null;
    this.listScroll = 0;
    this.phase = 'BROWSE';
    this.message = '';
  }

  acceptGig(gig) {
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
      this.phase = 'TRAVEL';
    }
    this.state.save();
  }

  startGig() {
    this.phase = 'GIG';
    this.qte = null;
    this.node = getNode(this.currentGig.choiceTree, 0);
    if (!this.node) this.afterChoices();
  }

  choose(choice) {
    const { outcomeText } = resolveChoice(this.state, choice);
    this.outcomeTexts.push(`${choice.text} — ${outcomeText}`);
    if (choice.next) {
      this.node = getNode(this.currentGig.choiceTree, choice.next);
      if (!this.node) this.afterChoices();
    } else {
      this.afterChoices();
    }
  }

  afterChoices() {
    this.node = null;
    if (this.currentGig.hasQTE) {
      this.qte = createQTE(this.currentGig, this.state);
    } else {
      this.finishGig(null);
    }
  }

  finishGig(qteResult) {
    const s = this.state;
    const gig = this.currentGig;
    s.energy -= gigEnergyCost(gig, s);
    s.hoursLeft -= gig.hours;

    let payout = gig.payout;
    if (qteResult) {
      if (qteResult.success) {
        payout = Math.round(payout * (1 + qteResult.score / 500));
        s.reputation += 0.1;
      } else {
        payout = Math.round(payout * 0.7);
        s.reputation -= 0.2;
        s.stress += 10;
      }
    }

    // scam roll — risk% chance the client stiffs you, worse with flaky clients
    let scamText = '';
    const scamChance = gig.risk * (gig.clientReliability <= 2 ? 1.5 : 1);
    if (Math.random() * 100 < scamChance) {
      const kept = Math.random() * 0.5;
      payout = Math.round(payout * kept);
      s.stress += 15;
      scamText = kept < 0.1 ? 'The client vanished without paying. Scammed!' : 'The client short-changed you with a shrug.';
      audio.playStress();
    }

    // steady-work event: double pay
    if (s.doublePayDays > 0 && payout > 0) {
      payout *= 2;
      this.outcomeTexts.push('Steady contract: payout doubled!');
    }

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

    this.results = {
      payout,
      scamText,
      qteResult,
      outcomeTexts: this.outcomeTexts,
      deltas: {
        cash: s.cash - this.snapshot.cash,
        stress: s.stress - this.snapshot.stress,
        rep: s.reputation - this.snapshot.rep,
        energy: s.energy - this.snapshot.energy,
      },
    };
    this.resultsT = 0;
    this.qte = null;
    this.phase = 'RESULTS';
    if (payout > 0) {
      audio.playCashIn();
      spawnBurst(400, 182, { color: '#2ecc71', count: 18 });   // sparkle on the payout counter
    }
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
    this.phase = 'EVENING';
    this.shopOpen = false;
    if (this.state.daysUntilBills <= 0) {
      this.billsOpen = true;
      this.billsPaid = { rent: false, phone: false, food: false };
    }
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
    s.weekStats = { startingCash: s.cash, gigsDone: 0, totalEarned: 0, daysWithEvents: 0 };
    // rotate the repeat-client pool weekly: ~30% stay loyal, the rest must be re-won
    s.repeatClients = s.repeatClients.filter(() => Math.random() < 0.3);
    s.save();
  }

  payDebt(kind) {
    const s = this.state;
    if (kind === 'rent' && s.cash >= s.unpaidRent && s.unpaidRent > 0) {
      s.cash -= s.unpaidRent; s.unpaidRent = 0; s.rentOverdueDays = 0; audio.playCashOut();
    }
    if (kind === 'phone' && s.cash >= s.unpaidPhone && s.unpaidPhone > 0) {
      s.cash -= s.unpaidPhone; s.unpaidPhone = 0; s.phoneCut = false; audio.playCashOut();
    }
    s.save();
  }

  buyUpgrade(up) {
    const s = this.state;
    if (s.cash < up.cost || s.upgradesOwned.includes(up.name)) return;
    s.cash -= up.cost;
    s.upgradesOwned.push(up.name);
    up.apply(s);
    audio.playCashOut();
    s.save();
  }

  sleep() {
    const s = this.state;
    if (this.billsOpen || this.wrapUpOpen) return;
    s.day += 1;
    s.daysUntilBills -= 1;
    if (s.unpaidRent > 0) s.rentOverdueDays += 1;
    applyHealthDecay(s);
    s.ateYesterday = !s.hungry;
    const recovery = (s.hungry ? 25 : 45) * (s.health / 100);
    s.energy = Math.min(100, s.energy + Math.round(recovery));
    s.stress = Math.max(0, s.stress - 8);
    s.hoursLeft = 12;
    if (s.doublePayDays > 0) s.doublePayDays -= 1;
    s.weather = rollWeather();
    s.todayGigs = generateDailyGigs(s);
    this.message = '';
    if (s.rentOverdueDays >= 14) {
      this.phase = 'GAMEOVER';
      s.save();
      return;
    }
    this.beginMorning();
    s.save();
  }

  newGame() {
    this.state.reset();
    this.state.weather = rollWeather();
    this.state.todayGigs = generateDailyGigs(this.state);
    this.state.save();
    this.phase = 'MORNING';
    this.message = '';
    this.currentGig = null;
    this.results = null;
    this.restDay = false;
    this.billsOpen = false;
    this.wrapUpOpen = false;
    this.ticker = { lines: [], idx: 0, t: 0 };
    this.eventQueue = [];
    this.activeEvent = null;
  }

  // ---------- frame ----------

  update(dt) {
    updateFX(dt);
    if (this.phase === 'MORNING' && !this.tutorialVisible()) {
      if (this.ticker.idx < this.ticker.lines.length) {
        this.ticker.t += dt;
        if (this.ticker.t >= 3) { this.ticker.idx += 1; this.ticker.t = 0; }
      } else if (!this.activeEvent && this.eventQueue.length > 0) {
        this.startNextEvent();
      } else if (this.activeEvent) {
        this.eventT += dt;   // drives the modal fade-in for all event types
        if (!this.activeEvent.choices) {
          const dur = this.activeEvent.resolved ? 2 : (this.activeEvent.effect ? 2.5 : 2);
          if (this.eventT >= dur) this.startNextEvent();
        }
      }
    }
    if (this.phase === 'TRAVEL') {
      this.travelT = Math.min(2, this.travelT + dt);
    }
    if (this.phase === 'GIG' && this.qte && !this.tutorialVisible()) {
      this.qte.update(dt);
      if (this.qte.done) {
        const result = this.qte.result;
        if (!this.qteEndTimer) this.qteEndTimer = 0;
        this.qteEndTimer += dt;
        if (this.qteEndTimer > 0.8) {
          this.qteEndTimer = 0;
          this.finishGig(result);
        }
      }
    }
    if (this.phase === 'RESULTS') {
      this.resultsT += dt;
    }
  }

  render(ctx) {
    UI.begin();
    ctx.clearRect(0, 0, 800, 600);

    switch (this.phase) {
      case 'MORNING': screens.apartmentScreen(ctx, this); break;
      case 'BROWSE': renderListings(ctx, this); break;
      case 'TRAVEL': screens.travelScreen(ctx, this); break;
      case 'GIG': screens.gigScreen(ctx, this); break;
      case 'RESULTS': screens.resultsScreen(ctx, this); break;
      case 'EVENING': screens.eveningScreen(ctx, this); break;
      case 'GAMEOVER': screens.gameOverScreen(ctx, this); break;
    }

    if (this.phase !== 'GAMEOVER') renderHUD(ctx, this.state);
    renderFX(ctx);
    if (this.tutorialVisible()) renderTutorial(ctx, this);

    this.processInput();
  }

  processInput() {
    let click;
    while ((click = InputManager.consumeClick())) {
      if (!this.bgmStarted) { this.bgmStarted = true; audio.startBGM(); }
      // tutorial overlay consumes clicks and advances (or skips entirely)
      if (this.tutorialVisible()) {
        const s = this.state;
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
      // morning intro: clicks skip ticker lines / auto-dismiss events
      if (this.phase === 'MORNING' && !this.morningReady) {
        if (this.ticker.idx < this.ticker.lines.length) { this.ticker.idx += 1; this.ticker.t = 0; continue; }
        if (this.activeEvent && !this.activeEvent.choices) { this.startNextEvent(); continue; }
        // events with choices fall through to their buttons
      }
      if (this.phase === 'GIG' && this.qte && !this.qte.done) {
        this.qte.handleTap(click);
        continue;
      }
      if (UI.handleClick(click)) audio.playClick();
    }
  }
}
