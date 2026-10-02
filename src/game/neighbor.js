// A story thread through the month (2026-10-02). The days were all gigs and events with nobody
// who remembered you from one week to the next. Dee, the retired bus driver across the hall,
// checks in at the start of each week, and what she says depends on how the month is going: a
// struggling week gets help, a good one gets advice. Small effects, mostly words.

const THRIVING = (s) => s.cash >= 250 && s.health >= 50 && !s.unpaidRent;

export const NEIGHBOR_BEATS = {
  8: {
    good: { text: 'Dee from across the hall catches you on the stairs. "You made rent. I heard the landlord whistling." She hands you a spare umbrella. "My knee says rain this week."', apply: (s) => { s.stress -= 3; return '-3 stress'; } },
    rough: { text: 'A note under your door, in careful bus-driver capitals: "SAW YOUR LIGHT ON LATE AGAIN. SOUP ON MY STOVE. NO CHARGE, NO SPEECH. - DEE"', apply: (s) => { s.health += 6; s.ateYesterday = true; return '+6 balance'; } },
  },
  15: {
    good: { text: 'Dee asks how the hustle is going and actually listens to the answer. "Thirty years driving the 14 bus. Same trick as yours: you rest on the downhill, or you never make the uphill."', apply: (s) => { s.support += 6; return '+6 support'; } },
    rough: { text: 'A jar of coins sits outside your door with a sticky note: "For the phone bill. Pay me back in stories. - D"', apply: (s) => { s.cash += 20; return '+$20'; } },
  },
  22: {
    good: { text: 'Dee has been telling the whole building about you. "Busiest person I know," she says. Two neighbors nod at you in the hall like they already know your name.', apply: (s) => { s.reputation += 0.2; return '+0.2 reputation'; } },
    rough: { text: 'Dee knocks with a plate of rice and an opinion. "You look like I did in my second year on the route. Take one evening off this week. Doctor\'s orders. I am not a doctor."', apply: (s) => { s.stress -= 6; return '-6 stress'; } },
  },
  29: {
    good: { text: 'Two coffees on the stairs. "Last week of the month," Dee says. "Whatever the number says on day thirty, you showed up every morning. On my scorecard, that is the number."', apply: (s) => { s.health += 4; return '+4 balance'; } },
    rough: { text: 'Two coffees on the stairs. "Last week," Dee says. "The month was rigged before you started it. I drove that bus long enough to know. Finish it anyway. Then we eat."', apply: (s) => { s.health += 4; s.stress -= 4; return '+4 balance, -4 stress'; } },
  },
};

/** The neighbor's morning card for today, if today opens a week. Shaped like a daily event. */
export function neighborBeat(state) {
  const beat = NEIGHBOR_BEATS[state.day];
  if (!beat) return null;
  const v = THRIVING(state) ? beat.good : beat.rough;
  return { tier: 1, label: 'ACROSS THE HALL', text: v.text, effect: (s) => v.apply(s) };
}
