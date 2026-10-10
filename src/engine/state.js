import { DEFAULT_CHARACTER } from '../ui/character.js';

export const SAVE_VERSION = 3; // v3: character gains body, pronouns, hairStyle, facialHair
export const RUN_LENGTH_DAYS = 30;

/** Set when another tab or window of the game saves: this copy is out of date and must not write
 *  over the newer save (QA round 3 #3, #11). main.js raises it; "Play here" reloads. */
export const saveLock = { stale: false };

export class GameState {
  constructor() {
    this.version = SAVE_VERSION;
    this.cash = 200;
    this.stress = 20;
    this.reputation = 1;  // 0-5 stars (fractional)
    this.energy = 80;
    this.day = 1;
    this.daysUntilBills = 7;
    this.hoursLeft = 12;
    this.character = { ...DEFAULT_CHARACTER };
    this.characterCreated = false; // a new run opens on the character creator until this is set
    this.inventory = [];
    this.gigHistory = [];
    this.repeatClients = [];
    this.todayGigs = [];
    this.upgradesOwned = [];
    this.energyPerTravel = 3;
    this.unpaidRent = 0;
    this.rentOverdueDays = 0;
    this.rentPrepaid = false;    // this week's rent paid ahead of the bills screen (QA round 3 #8)
    this.phoneCut = false;
    this.unpaidPhone = 0;
    this.hungry = false;
    this.gigsCompleted = 0;
    this.totalEarned = 0;
    // Session 2 additions
    this.health = 100;           // shown in the HUD as "Balance" since the QA pass
    this.coldDays = 0;
    this.ateYesterday = true;
    this.healthWarningShown = false;
    this.weather = null;         // rolled each morning
    this.tutorialSeen = false;
    this.tutorialStep = 0;
    this.seenMicrogames = [];    // microgames whose how-to card has been read (kept across runs)
    // Replayability (src/game/twists.js): the run's month twist and side goal. null on saves from
    // before they existed, which simply play by the original rules.
    this.twist = null;
    this.sideGoal = null;
    this.sideGoalDone = false;
    this.lastTwist = null;       // the previous run's twist, so a new run never repeats it
    this.weekNumber = 1;
    this.weekStats = { startingCash: 200, gigsDone: 0, totalEarned: 0, daysWithEvents: 0, eveningsRested: 0 };
    this.doublePayDays = 0;
    this.heldCash = 0;
    this.listingsLockedToday = false;
    this.eventTravelMod = 0;
    this.eventOutdoorEnergyMod = 0;
    // Evening loop (emotional intelligence / work-life balance pass)
    this.support = 20;           // 0-100, built by check-ins; softens the burnout slope
    this.eveningDoneDay = 0;     // day number whose evening choice has been made
    this.eveningsRested = 0;
    this.calm = false;           // tonight's wind-down eases tomorrow's timed challenges
    this.tiredTomorrow = false;  // a late side hustle costs energy at wake
    this.groceriesDay = 0;       // day groceries were bought (clears Hungry for that day)
    this.lateGigTomorrow = null; // accepted late ping → an extra listing tomorrow
    this.eiWins = 0;
    this.eiDecks = {};           // no-repeat scenario decks for the EI games (see qte.js drawFromDeck)
    this.clientLog = {};         // per client: visits, last job, whether it went well (game/clients.js)
    this.lessonsSeen = [];       // takeaways shown this run, for the day-30 summary (2026-10-02)
    this.recallDone = [];        // takeaways already asked back on a recall morning (game/recall.js)
    // The month's real numbers, for the day-30 / eviction "math of the month" page (2026-09-29).
    this.monthMath = { paidHours: 0, gigs: 0, lostToNonPayment: 0, rentPaid: 0, phonePaid: 0, travelEnergy: 0, sickDays: 0,
      // what the month was made of, for "why it went this way" (game/depth.js monthInsights)
      byType: {}, tips: 0, toolBeltExtra: 0, travelSaved: 0, lateHustles: 0, hustleCash: 0, firstOverdueDay: 0, partialRent: 0 };
    // 2026-10-07 depth pass (game/depth.js): pace for the rent forecast, bad-luck protection,
    // standing contracts, the run's background, and an in-progress gig that survives the app
    // being killed.
    this.paceLog = [];           // what each finished day earned (gross)
    this.dayStartEarned = 0;     // totalEarned at the start of today, for paceLog
    this.lastCrisisDay = -99;    // day of the last crisis event (crises cool down for 4 days)
    this.contracts = [];         // standing contracts: { client, title, payout, every, nextDay }
    this.background = 'fresh';   // starting background (game/depth.js BACKGROUNDS)
    this.activeGig = null;       // the gig in progress, cleared when its receipt prints
    this.story = {};             // your story this run: choices, flags, the advance (game/story.js)
    this.pinnedTakeaway = '';    // the lesson the player chose at the month's debrief; kept across runs
    this.lessonsKnown = [];      // every takeaway ever shown, across runs: seen ones show compact
    this.microgamePlays = {};    // plays per challenge across runs: variants unlock after a few
    this.rentCredit = 0;         // Rent Hike: building chores knock this off the next rent
    this.deeCovered = false;     // Tight-Knit Block / Neighborhood Kid: Dee has covered a short bill
    this.rentGraceDays = 0;      // a partial rent payment of half or more buys 7 days off the eviction clock
    this.choresWeek = 0;         // Rent Hike: the week the super's chores were last offered
    this.eveningNoteDay = 0;     // a morning choice already spoke for this evening
    this.runNumber = 1;          // which run this is; kept across reset()
    this.lastRun = null;         // how the previous run ended ({ day, cash, complete }), for Welcome back
    this.lastPlayed = 0;         // ms timestamp of the last save, for Welcome back
    this.runComplete = false;    // day 30 finished
    this.freePlay = false;       // chose to keep going past day 30
    // Preferences, not run state — survive `reset()` (see reset() below), same pattern as the
    // other Bennett AI Solutions games (Semester Zero, Leaves of Deceit).
    this.settings = {
      masterVolume: 1,
      musicVolume: 0.35,
      sfxVolume: 1,
      muted: false,
      reduceTimingPressure: false,
      reduceMotion: false,
      largeText: null,   // null = follow the device (ui/text.js systemPrefersLargeText)
    };
    this.load();
  }
  save() {
    if (saveLock.stale) return;
    this.lastPlayed = Date.now();
    localStorage.setItem('gigWorkerState', JSON.stringify(this));
  }
  load() {
    const saved = localStorage.getItem('gigWorkerState');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const defaults = JSON.parse(JSON.stringify(this));
      Object.assign(this, parsed);
      // A save from before the creator existed is a player already mid-run: never interrupt them
      // with it (the look stays editable every morning). Their old colours carry over as-is.
      if (parsed.characterCreated === undefined) this.characterCreated = true;
      // Not saved (non-enumerable): lets the game offer Continue / New game on reopening a run.
      Object.defineProperty(this, 'fromSave', { value: true, configurable: true });
      // ...and when that save was last written, before this session's first save moves it on.
      Object.defineProperty(this, 'savedAt', { value: parsed.lastPlayed || 0, configurable: true });
      this.character = { ...defaults.character, ...(parsed.character || {}) };
      // Backfill anything a pre-v2 save (or a partially written one) lacks, against the
      // constructor defaults — no field is ever left undefined.
      for (const k of Object.keys(defaults)) if (this[k] === undefined || this[k] === null) this[k] = defaults[k];
      this.settings = { ...defaults.settings, ...(parsed.settings || {}) };
      this.weekStats = { ...defaults.weekStats, ...(parsed.weekStats || {}) };
      this.monthMath = { ...defaults.monthMath, ...(parsed.monthMath || {}) };
      // A save whose tutorial pointer ran off the end (or went negative) would hide the tutorial forever.
      if (typeof this.tutorialStep !== 'number' || this.tutorialStep < 0) this.tutorialStep = 0;
      this.version = SAVE_VERSION;
    } catch {
      // Corrupted/malformed localStorage — keep the fresh-constructor defaults already on
      // `this` rather than crashing the whole game on boot.
      console.warn('gigWorkerState in localStorage was corrupted — starting a fresh save.');
      localStorage.removeItem('gigWorkerState');
    }
  }
  reset() {
    const settings = this.settings;
    const character = { ...this.character }; // a new run's creator starts from the last look
    const tutorialSeen = this.tutorialSeen;  // someone starting over has seen it (Settings replays it)
    const seenMicrogames = this.seenMicrogames || [];
    const lessonsKnown = [...new Set([...(this.lessonsKnown || []), ...(this.lessonsSeen || [])])];
    const pinnedTakeaway = this.pinnedTakeaway || '';
    const microgamePlays = { ...(this.microgamePlays || {}) };
    const background = this.background || 'fresh';
    const lastTwist = this.twist || this.lastTwist;
    // Welcome back says which run this is and how the last one ended, so a fresh Day 1 after a
    // finished month never reads as lost progress (QA round 3 #11).
    const runNumber = (this.runNumber || 1) + 1;
    const lastRun = this.characterCreated && (this.day > 1 || this.gigsCompleted > 0)
      ? { day: Math.min(this.day, RUN_LENGTH_DAYS), cash: Math.round(this.cash), complete: !!this.runComplete || this.day > RUN_LENGTH_DAYS, evicted: this.rentOverdueDays >= 14 }
      : this.lastRun;
    localStorage.removeItem('gigWorkerState');
    Object.assign(this, new GameState());
    this.settings = settings;
    this.character = character;
    this.characterCreated = false;
    this.tutorialSeen = tutorialSeen;
    this.seenMicrogames = seenMicrogames;
    this.lessonsKnown = lessonsKnown;
    this.pinnedTakeaway = pinnedTakeaway;
    this.microgamePlays = microgamePlays;
    this.background = background;
    this.lastTwist = lastTwist;
    this.runNumber = runNumber;
    this.lastRun = lastRun;
    this.save();
  }
  clamp() {
    this.cash = Math.max(0, this.cash);
    this.stress = Math.min(100, Math.max(0, this.stress));
    this.reputation = Math.min(5, Math.max(0, this.reputation));
    this.energy = Math.min(100, Math.max(0, this.energy));
    this.health = Math.min(100, Math.max(0, this.health));
    this.support = Math.min(100, Math.max(0, this.support));
  }
}
