// A returning client with a story (publisher polish 2026-10-12): Otis, the jazz drummer, across
// three beats, so the city remembers how you do business.
//
//   1. Any job for Otis ends with him asking you back: his practice room needs soundproofing.
//   2. Two or more days later his own listing is on the board. Halfway through, he asks you to
//      "throw in" painting the room: quote a price, do it as a favor, or finish the job you agreed.
//   3. Two or more days after that, the morning answers your choice: a fair standing booking
//      (you named a price), a referral that expects free extras (you did the favor), or a warm
//      thank-you (you kept to the agreement). None is the "good person" ending; each is honest
//      about what that way of working tends to bring.
//
// The lesson is scope creep: name extra work and its price before you start it. All money stays
// inside the ranges the game already uses (a garage-sized payout, a +$30 extra like the moving
// job's overload, contractTerms for the booking), so the balance bands are untouched in kind.
import { GIG_TEMPLATES, makeReferralGig } from './gigs.js';
import { clientStanding, contractTerms } from './depth.js';

export const OTIS = 'Otis';
export const OTIS_STUDIO = "Soundproof Otis's Practice Room";
export const OTIS_CHOICE = {
  quote: 'Quote a price for the painting',
  favor: 'Do the painting as a favor',
  agreed: 'Finish the soundproofing only',
};

function arc(s) {
  if (!s.otisArc) s.otisArc = { stage: 0 };
  return s.otisArc;
}

/** From day 2, while the arc has not started, one of the day's listings is Otis's (unless he has
 *  stopped hiring you), so the story is reachable in an ordinary month. Mutates `gigs`. */
export function ensureOtisListing(s, gigs) {
  if (arc(s).stage !== 0 || s.day < 2 || clientStanding(s, OTIS) === 'done') return;
  if (gigs.some((g) => g.client === OTIS)) return;
  const g = gigs.find((x) => !x.contract && x.type === 'physical') || gigs.find((x) => !x.contract);
  if (!g) return;
  g.client = OTIS;
  g.standing = clientStanding(s, OTIS);
  g.isRepeat = (s.repeatClients || []).includes(OTIS);
}

/** Beat 1: called when a gig finishes. Returns the line for the receipt, or null. */
export function noteOtisGig(s, gig) {
  const a = arc(s);
  if (a.stage !== 0 || gig.client !== OTIS || gig.otisStudio) return null;
  a.stage = 1; a.day = s.day;
  return 'Otis, drumming on the doorframe: "You work like a metronome. My practice room needs soundproofing. I\'ll post it."';
}

/** Beat 2: Otis's own listing, from two days after beat 1 until it is taken (or the month ends). */
export function otisStudioGig(s) {
  const a = arc(s);
  if (a.stage !== 1 || s.day < a.day + 2) return null;
  const t = GIG_TEMPLATES.find((x) => x.title === 'Clean Out Garage') || GIG_TEMPLATES[0];
  return {
    title: OTIS_STUDIO, type: 'physical', payout: 85, hours: 3, risk: 0, location: 'safe',
    skillReq: t.skillReq, hasQTE: false, choiceTree: 'otisStudio', outdoor: false,
    clientReliability: 5, client: OTIS, isRepeat: true, standing: clientStanding(s, OTIS),
    description: 'Otis asked for you by name. Foam panels, a door seal, no surprises. Probably.',
    remote: false, otisStudio: true,
  };
}

/** Beat 2's answer, recorded the moment it is chosen. */
export function noteOtisChoice(s, choiceText) {
  const key = Object.keys(OTIS_CHOICE).find((k) => OTIS_CHOICE[k] === choiceText);
  if (!key) return;
  const a = arc(s);
  a.stage = 2; a.day = s.day; a.choice = key;
}

/** Beat 3: the morning card, two days after the studio job. Shaped like a daily event. */
export function otisMorningCard(s) {
  const a = arc(s);
  if (a.stage !== 2 || s.day < a.day + 2) return null;
  a.stage = 3;
  if (a.choice === 'quote') {
    const t = GIG_TEMPLATES.find((x) => x.title === 'Clean Out Garage') || GIG_TEMPLATES[0];
    const terms = contractTerms(s, OTIS, t);
    return {
      tier: 2, label: 'OTIS CALLS',
      text: `Otis: "You told me the price before you picked up the roller. I like that. Every ${terms.every} days at my place, $${terms.payout}, steady?"`,
      choices: [
        { text: 'Take the standing booking', apply: (st) => { st.contracts = [...(st.contracts || []), terms]; return `Booked. Otis expects you on day ${terms.nextDay}.`; },
          after: 'Clear terms made you someone he can plan around, and that is worth steady money.' },
        { text: 'Keep my days open', apply: () => 'Otis understands. The door stays open.',
          after: 'A standing booking is a trade: reliable pay for less freedom. Both are fair choices.' },
      ],
    };
  }
  if (a.choice === 'favor') {
    return {
      tier: 2, label: 'OTIS SENT SOMEONE',
      text: 'Otis told a bandmate about you: "does the job and throws in the painting for free." A referral is on the board, and so is that expectation.',
      effect: (st) => {
        const g = makeReferralGig(st);
        g.title = g.title.replace('Referral: ', 'Referral from Otis: ');
        g.description = 'Otis told them you throw in extras for free.';
        st.todayGigs = [g, ...(st.todayGigs || [])];
        return `+1 referral gig on the board ($${g.payout})`;
      },
    };
  }
  return {
    tier: 2, label: 'A VOICEMAIL',
    text: 'A drum fill, then Otis: "Room sounds great. Found a painter. Thanks for doing exactly what you said you would."',
    effect: (st) => { st.stress -= 3; return '-3 stress'; },
  };
}
