export class GameState {
  constructor() {
    this.cash = 200;
    this.stress = 20;
    this.reputation = 1;  // 0-5 stars (fractional)
    this.energy = 80;
    this.day = 1;
    this.daysUntilBills = 7;
    this.hoursLeft = 12;
    this.character = { skin: '#d4a574', hair: '#4a3728', shirt: '#3498db' };
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
    this.health = 100;           // hidden meter
    this.coldDays = 0;
    this.ateYesterday = true;
    this.healthWarningShown = false;
    this.weather = null;         // rolled each morning
    this.tutorialSeen = false;
    this.tutorialStep = 0;
    this.weekNumber = 1;
    this.weekStats = { startingCash: 200, gigsDone: 0, totalEarned: 0, daysWithEvents: 0 };
    this.doublePayDays = 0;
    this.heldCash = 0;
    this.listingsLockedToday = false;
    this.eventTravelMod = 0;
    this.eventOutdoorEnergyMod = 0;
    this.load();
  }
  save() { localStorage.setItem('gigWorkerState', JSON.stringify(this)); }
  load() {
    const saved = localStorage.getItem('gigWorkerState');
    if (saved) Object.assign(this, JSON.parse(saved));
  }
  reset() {
    localStorage.removeItem('gigWorkerState');
    Object.assign(this, new GameState());
  }
  clamp() {
    this.cash = Math.max(0, this.cash);
    this.stress = Math.min(100, Math.max(0, this.stress));
    this.reputation = Math.min(5, Math.max(0, this.reputation));
    this.energy = Math.min(100, Math.max(0, this.energy));
    this.health = Math.min(100, Math.max(0, this.health));
  }
}
