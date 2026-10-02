// Clients with a personality and a memory (2026-10-02). Clients used to be a name drawn from a
// list of ten: the same "Marge" could hire you three times and never once know who you were, and
// every one of them sounded alike. Now each has one line of character for the first meeting, and
// remembers how the last job with you went. The reference is Hades and Valve's rule-based dialogue
// (Ruskin, GDC 2012): pick the most specific line the facts allow, fall back to the general one.
// Words only; payouts already reward regulars through `repeatClients` in gigs.js.

export const CLIENTS = [
  { name: 'Marge', meet: 'Marge, a retired teacher, inspects you like a late homework assignment.',
    back: 'Marge nods. "You again. Last time you earned a B-plus. Let\'s see an A."',
    wary: 'Marge purses her lips. "Last time was a C. I believe in second chances. Once."' },
  { name: 'Dev', meet: 'Dev answers mid-call, wearing a headset, and points at the job.',
    back: 'Dev ends a call just to say hi. "The {lastJob} person! You\'re in my favorites."',
    wary: 'Dev keeps the headset on. "After last time, I\'m timing this one."' },
  { name: 'Tony', meet: 'Tony shakes your hand too hard and starts haggling before hello.',
    back: 'Tony grins. "My guy. Same rate as last time, and I didn\'t even try to haggle."',
    wary: 'Tony crosses his arms. "Last job, I paid full price for half a job. Convince me."' },
  { name: 'Priya', meet: 'Priya hands you a printed checklist. It is laminated.',
    back: 'Priya smiles. "You followed the checklist last time. Nobody follows the checklist."',
    wary: 'Priya hands you the checklist again. "Last time we skipped step four. Not today."' },
  { name: 'Walt', meet: 'Walt, a gruff veteran, says nothing and points at the work.',
    back: 'Walt almost smiles. "You. Good. Coffee\'s on the porch."',
    wary: 'Walt stares for a long time. "Don\'t repeat last time." That is the whole speech.' },
  { name: 'June', meet: 'June just bought her first house and apologizes for everything in it.',
    back: 'June beams. "I told my sister about you! You saved me last time."',
    wary: 'June hesitates. "Last time was a little stressful. It was probably my fault?"' },
  { name: 'Otis', meet: 'Otis, a jazz drummer, is practicing. He nods in time when you arrive.',
    back: 'Otis taps out a little fanfare on the doorframe. "The {lastJob} legend returns."',
    wary: 'Otis stops drumming. "Last gig was off-beat, friend. Let\'s find the groove."' },
  { name: 'Rosa', meet: 'Rosa runs a bakery and has exactly eleven minutes for you.',
    back: 'Rosa presses a pastry into your hand. "For last time. Now, eleven minutes."',
    wary: 'Rosa checks the clock. "Last time ran long and cost me a rush. Tight today."' },
  { name: 'Kip', meet: 'Kip is a college student paying with birthday money and great enthusiasm.',
    back: 'Kip high-fives you. "Dude. You came back! Last time was legendary."',
    wary: 'Kip winces. "Last time kind of went sideways, right? Redemption arc?"' },
  { name: 'Lena', meet: 'Lena works night shifts as a nurse and is running on coffee.',
    back: 'Lena yawns a smile. "You\'re the one who made last time easy. Thank you."',
    wary: 'Lena sighs. "I don\'t have energy for a repeat of last time. Please."' },
];

export const CLIENT_NAMES = CLIENTS.map((c) => c.name);

export function clientByName(name) {
  return CLIENTS.find((c) => c.name === name) || null;
}

/** The short form of a gig title for dialogue: "Help Move Furniture" -> "help move furniture". */
export function jobNoun(title) {
  return (title || 'job').replace(/^Referral: /, '').split(' — ')[0].toLowerCase();
}

/** What the client says at the door: a first meeting, a happy return, or a wary one. */
export function clientGreeting(state, name) {
  const c = clientByName(name);
  if (!c) return '';
  const log = state?.clientLog?.[name];
  if (!log || !log.visits) return c.meet;
  return (log.lastGood ? c.back : c.wary).replace(/\{lastJob\}/g, jobNoun(log.lastJob));
}

/** Remember how today's job with this client went. */
export function rememberClient(state, name, jobTitle, good) {
  if (!state || !name) return;
  const book = state.clientLog || (state.clientLog = {});
  const prev = book[name] || { visits: 0 };
  book[name] = { visits: prev.visits + 1, lastJob: jobTitle, lastGood: !!good };
}
