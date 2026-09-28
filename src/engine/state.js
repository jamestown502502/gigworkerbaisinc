import { DEFAULT_CHARACTER } from '../ui/character.js';

export const SAVE_VERSION = 3; // v3: character gains body, pronouns, hairStyle, facialHair
export const RUN_LENGTH_DAYS = 30;

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
    };
    this.load();
  }
  save() { localStorage.setItem('gigWorkerState', JSON.stringify(this)); }
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
      this.character = { ...defaults.character, ...(parsed.character || {}) };
      // Backfill anything a pre-v2 save (or a partially written one) lacks, against the
      // constructor defaults — no field is ever left undefined.
      for (const k of Object.keys(defaults)) if (this[k] === undefined || this[k] === null) this[k] = defaults[k];
      this.settings = { ...defaults.settings, ...(parsed.settings || {}) };
      this.weekStats = { ...defaults.weekStats, ...(parsed.weekStats || {}) };
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
    localStorage.removeItem('gigWorkerState');
    Object.assign(this, new GameState());
    this.settings = settings;
    this.character = character;
    this.characterCreated = false;
    this.tutorialSeen = tutorialSeen;
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
