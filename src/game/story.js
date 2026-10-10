// Your story (QA round 4 depth pass, 2026-10-10). Backgrounds used to change only the rules; now
// each one is also a reason to be hustling: a personal goal for the month, three story mornings
// (days 6, 13 and 20, clear of Dee's weekly visits and the recall cards) that each ask for a real
// choice, and an ending that reads the goal and those choices back. Five backgrounds, five
// different months: a run is remembered for its story, not only its numbers.
//
// Every choice carries `after`, the one-line reason it matters off the screen, in the same voice as
// the job lessons. Pure rules over the save state; tests/unit/story.test.js plays every branch.
import { backgroundOf } from './depth.js';

const creativeGigs = (s) => (s.monthMath?.byType?.creative?.gigs) || 0;

export const STORIES = {
  fresh: {
    goal: {
      text: 'End the month owing nothing, with $300 put by',
      check: (s) => !s.unpaidRent && !s.unpaidPhone && s.cash >= 300,
      progress: (s) => (s.unpaidRent || s.unpaidPhone ? `clear your debts first ($${Math.round(s.cash)} saved)` : `$${Math.round(s.cash)} of $300 saved`),
    },
    intro: 'Your sister Rosa drove you to the bus with a bag of sandwiches. "Thirty days," she said. "If you can make rent for a month, you can make it for a year."',
    beats: {
      6: {
        text: 'Rosa calls. Her car failed inspection and the repair is $60. She hates asking.',
        choices: [
          { text: 'Send her $60', apply: (s) => { s.cash -= 60; s.support += 8; return '-$60, +8 support'; }, flag: 'helpedRosa',
            after: 'Helping family is real, and so is rent. Decide what you can give before the call, not during it.' },
          { text: 'Tell her not this week', apply: (s) => { s.stress += 4; return '+4 stress'; }, flag: 'toldRosaNo',
            after: 'A clear no now is kinder than a yes you cannot keep.' },
        ],
      },
      13: {
        text: 'A pay app offers an "instant advance": $100 now, $115 taken back in seven days. One tap.',
        choices: [
          { text: 'Take the $100 advance', apply: (s) => { s.cash += 100; s.story.advanceDueDay = s.day + 7; s.story.advanceOwed = 115; return '+$100 now, $115 due on day ' + (s.day + 7); }, flag: 'tookAdvance',
            after: '$15 on $100 for one week is a yearly rate over 700%. Advances are for emergencies, not for rent you can see coming.' },
          { text: 'Skip it', apply: () => 'Nothing borrowed, nothing owed.', flag: 'skippedAdvance',
            after: 'The cheapest loan is the one you plan your way out of needing.' },
        ],
      },
      20: {
        text: 'Rosa again, just to talk. "How is it really going?"',
        choices: [
          { text: 'Tell her the truth', apply: (s) => { s.support += 10; s.stress -= 6; return '+10 support, -6 stress'; }, flag: 'toldTruth',
            after: 'Saying it out loud is how help finds you. People cannot back a plan they have not heard.' },
          { text: '"Great! Busy!"', apply: (s) => { s.stress += 4; return '+4 stress'; }, flag: 'keptBrave',
            after: 'A brave face costs energy every day you wear it.' },
        ],
      },
    },
    endings: {
      met: 'Rosa answers on the first ring. "Three hundred? Saved?" You can hear her grinning. The bag of sandwiches was a good investment.',
      missed: 'You call Rosa anyway. "So it was a hard month," she says. "Now you know what a month costs. That is the part they never tell you."',
    },
  },
  mover: {
    goal: {
      text: 'Finish with your back in one piece: balance 60 or more on day 30',
      check: (s) => s.health >= 60,
      progress: (s) => `balance ${Math.round(s.health)} of 60`,
    },
    intro: 'Six years with Sal\'s moving crew taught you to carry anything, and left you a knee that predicts the weather. This month you work for yourself. Your body is the only equipment you cannot replace.',
    beats: {
      6: {
        text: 'Sal texts: cash job tonight, a piano up three flights, $90 in hand. No insurance, no questions.',
        choices: [
          { text: 'Take the piano job', apply: (s) => { s.cash += 90; s.health -= 12; s.energy -= 15; return '+$90, -12 balance, -15 energy'; }, flag: 'tookPiano',
            after: 'Cash work pays tonight. An injury with no insurance can cost you every week after.' },
          { text: 'Pass on it', apply: (s) => { s.stress -= 3; return '-3 stress'; }, flag: 'passedPiano',
            after: 'Turning down the wrong job is part of the job.' },
        ],
      },
      13: {
        text: 'Your lower back has a new opinion every morning. A walk-in clinic down the block charges $40.',
        choices: [
          { text: 'See the clinic ($40)', apply: (s) => { s.cash -= 40; s.health += 15; return '-$40, +15 balance'; }, flag: 'sawClinic',
            after: 'Small pains treated early stay small. The same pain ignored for a month becomes a month off.' },
          { text: 'Push through it', apply: (s) => { s.health -= 8; return '-8 balance'; }, flag: 'pushedThrough',
            after: 'Pushing through works until the day it does not, usually mid-lift.' },
        ],
      },
      20: {
        text: 'Sal again, serious this time: a steady spot back on the crew. Less per hour, but sick days and a health plan.',
        choices: [
          { text: 'Ask what the health plan covers', apply: (s) => { s.support += 6; s.stress -= 4; return '+6 support, -4 stress'; }, flag: 'askedPlan',
            after: 'Compare jobs on total pay: wage plus insurance, sick days and gear you do not have to buy.' },
          { text: 'Stay your own boss', apply: (s) => { s.reputation += 0.2; return '+0.2 reputation'; }, flag: 'stayedSolo',
            after: 'Freedom is worth something. Know the price you are paying for it.' },
        ],
      },
    },
    endings: {
      met: 'Day 30 and the knee is quiet. Sal calls to ask how you did it. "I said no to the dumb ones," you tell him. He laughs. He knows exactly which ones.',
      missed: 'By day 30 you are carrying the month in your back. The money was real. So is the ache. Next month, you price your body into every job.',
    },
  },
  artschool: {
    goal: {
      text: 'Build a portfolio: finish 4 creative gigs this month',
      check: (s) => creativeGigs(s) >= 4,
      progress: (s) => `${creativeGigs(s)} of 4 creative gigs`,
    },
    intro: 'You left art school two credits short and a sketchbook full. Everyone said "do what you love" and nobody said how to invoice for it. This month you find out what your work is worth.',
    beats: {
      6: {
        text: 'A cafe offers to hang your prints "for the exposure". The owner seems nice. The walls are very empty.',
        choices: [
          { text: 'Ask for a $50 hanging fee', apply: (s) => { if (s.reputation >= 2) { s.cash += 50; return '+$50: they said yes'; } s.stress += 2; return 'They said no. +2 stress, and your price is still yours'; }, flag: 'askedFee',
            after: 'Exposure does not pay rent. Ask for money; the worst answer is no, and you keep your price.' },
          { text: 'Take the exposure', apply: (s) => { s.reputation += 0.2; return '+0.2 reputation'; }, flag: 'tookExposure',
            after: 'Free work can open doors, but only when you choose it on purpose and set when it ends.' },
        ],
      },
      13: {
        text: 'An old classmate wants a poster for their band. "Free, right? We are friends."',
        choices: [
          { text: 'Offer a friends rate: $40', apply: (s) => { s.cash += 40; s.support -= 2; return '+$40, -2 support'; }, flag: 'friendsRate',
            after: 'A friends rate is still a rate. Decide your floor before anyone asks.' },
          { text: 'Do it free', apply: (s) => { s.support += 8; s.energy -= 10; return '+8 support, -10 energy'; }, flag: 'didFree',
            after: 'Giving work as a gift is fine. Just call it a gift, so nobody calls it your price.' },
        ],
      },
      20: {
        text: 'A shop wants your logo design. $60 for full rights, or $45 to license it and keep it yours.',
        choices: [
          { text: 'License it for $45', apply: (s) => { s.cash += 45; s.reputation += 0.1; return '+$45, you keep the rights'; }, flag: 'licensed',
            after: 'A license lets them use it; selling the rights makes it theirs forever. Price the second one higher.' },
          { text: 'Sell the rights for $60', apply: (s) => { s.cash += 60; return '+$60, the design is theirs'; }, flag: 'soldRights',
            after: 'Selling rights is fine when the price reflects that you can never sell it again.' },
        ],
      },
    },
    endings: {
      met: 'Four finished pieces, four invoices, four clients who would hire you again. The sketchbook is a portfolio now. It turns out "what your work is worth" is a number you get to say first.',
      missed: 'The portfolio is thinner than you hoped, but you learned the sentence that matters: "My rate is." Next month you say it sooner.',
    },
  },
  nightowl: {
    goal: {
      text: 'Guard your sleep: rest or wind down on 10 evenings',
      check: (s) => (s.eveningsRested || 0) >= 10,
      progress: (s) => `${s.eveningsRested || 0} of 10 rested evenings`,
    },
    intro: 'Your best ideas arrive at 2 a.m. and your alarm arrives at 7. Late gigs pay more, and you are good at them. This month the question is what the late nights cost in the mornings.',
    beats: {
      6: {
        text: 'A warehouse posts night shifts: 10 p.m. to 6 a.m., good pay, every night you want.',
        choices: [
          { text: 'Sign up for a shift this week', apply: (s) => { s.cash += 70; s.tiredTomorrow = 'heavy'; return '+$70, you wake up wrecked'; }, flag: 'nightShift',
            after: 'Night work pays a premium because it costs your body one. Count both.' },
          { text: 'Keep the nights for sleep', apply: (s) => { s.health += 5; s.stress -= 3; return '+5 balance, -3 stress'; }, flag: 'keptNights',
            after: 'Sleep is when your body repairs what the day spent. It is not lost time.' },
        ],
      },
      13: {
        text: 'Your phone says you averaged five hours of sleep this week. It suggests a "wind-down mode" at 11 p.m.',
        choices: [
          { text: 'Turn on the phone curfew', apply: (s) => { s.calmTonight = true; s.stress -= 5; return 'Rested tomorrow, -5 stress'; }, flag: 'curfew',
            after: 'A fixed screen-off time is one of the simplest sleep habits that works.' },
          { text: 'Dismiss it', apply: (s) => { s.energy += 5; return '+5 energy now'; }, flag: 'dismissedCurfew',
            after: 'The tired you tomorrow pays for the scrolling you tonight.' },
        ],
      },
      20: {
        text: 'Friends are going out at midnight. "Come on, you are always awake anyway."',
        choices: [
          { text: 'Go, just for an hour', apply: (s) => { s.support += 8; s.tiredTomorrow = 'light'; return '+8 support, a little tired tomorrow'; }, flag: 'wentOut',
            after: 'Friends are part of being well too. Set the hour you leave before you arrive.' },
          { text: 'Text them a rain check', apply: (s) => { s.health += 4; return '+4 balance'; }, flag: 'rainCheck',
            after: 'A rain check keeps the friendship and the sleep.' },
        ],
      },
    },
    endings: {
      met: 'Ten evenings off and the mornings feel different: clearer, kinder, faster. The 2 a.m. ideas still come. Now you are awake enough to use them.',
      missed: 'The late money was good. The mornings were not. You end the month knowing exactly what an hour of sleep is worth, because you sold so many of them.',
    },
  },
  local: {
    goal: {
      text: 'Be someone the block counts on: support 40 or more on day 30',
      check: (s) => (s.support || 0) >= 40,
      progress: (s) => `support ${Math.round(s.support || 0)} of 40`,
    },
    intro: 'You grew up on this block. Mr. Okafor at the corner store still calls you by your middle name, and Dee across the hall has known you since you were six. Here, money moves slower than favors.',
    beats: {
      6: {
        text: 'Mr. Okafor is short a pair of hands for the delivery truck. He pays in groceries.',
        choices: [
          { text: 'Help unload', apply: (s) => { s.energy -= 10; s.hungry = false; s.groceriesDay = s.day; s.support += 4; return 'Fed today, -10 energy, +4 support'; }, flag: 'helpedOkafor',
            after: 'Not every payment is cash. Count groceries, favors and goodwill at what they save you.' },
          { text: 'Too busy today', apply: (s) => { s.energy += 3; return '+3 energy'; }, flag: 'skippedOkafor',
            after: 'Protecting your time is allowed, even on your own block.' },
        ],
      },
      13: {
        text: 'The kid downstairs is failing math. Their mom asks if you could help on Tuesdays.',
        choices: [
          { text: 'Say yes to Tuesdays', apply: (s) => { s.support += 10; s.energy -= 8; return '+10 support, -8 energy'; }, flag: 'tutored',
            after: 'Teaching something is the fastest way to find out how well you know it.' },
          { text: 'Not this month', apply: (s) => { s.stress -= 2; return '-2 stress'; }, flag: 'noTutor',
            after: 'A clear "not now" leaves the door open for a real "yes" later.' },
        ],
      },
      20: {
        text: 'The landlord wants to raise rent for the whole building. Neighbors are meeting tonight in the laundry room.',
        choices: [
          { text: 'Go to the tenants meeting', apply: (s) => { s.support += 10; s.stress -= 4; return '+10 support, -4 stress'; }, flag: 'tenantMeeting',
            after: 'A tenants group can negotiate in ways one tenant alone cannot. Know your local tenant rights.' },
          { text: 'Skip it, you are exhausted', apply: (s) => { s.energy += 5; return '+5 energy'; }, flag: 'skippedMeeting',
            after: 'Rest is a reason. Ask someone to fill you in, so you still have a say.' },
        ],
      },
    },
    endings: {
      met: 'Day 30. Mr. Okafor slips an extra orange into your bag, the kid downstairs passed the quiz, and the landlord is negotiating instead of announcing. The block counts on you, and you on it.',
      missed: 'The month was mostly work, and the block noticed it less than you hoped. Favors are slow money. They pay best to people who keep showing up.',
    },
  },
};

export const STORY_DAYS = [6, 13, 20];

export function storyOf(state) {
  return STORIES[backgroundOf(state).id] || STORIES.fresh;
}

/** Day 1's card: who you are and this month's goal (plus last month's takeaway, if one was pinned). */
export function storyIntroCard(state) {
  if (state.day !== 1) return null;
  const st = storyOf(state);
  const take = state.pinnedTakeaway ? ` Last month you said you would use this: "${state.pinnedTakeaway}"` : '';
  return { tier: 1, label: `YOUR STORY: ${backgroundOf(state).name.toUpperCase()}`, text: `${st.intro}${take}`, effect: () => `Your goal: ${st.goal.text}.` };
}

/** A story morning, if today is one: a choice card shaped like a daily event. */
export function storyBeatCard(state) {
  const st = storyOf(state);
  const beat = st.beats[state.day];
  if (!beat) return null;
  state.story = state.story || {};
  if (state.story.choices && state.story.choices[state.day] !== undefined) return null;   // already answered today
  return {
    tier: 2, label: 'YOUR STORY',
    text: beat.text,
    choices: beat.choices.map((c, i) => ({
      text: c.text,
      apply: (s) => { s.story = s.story || {}; s.story.choices = { ...(s.story.choices || {}), [s.day]: i }; s.story.flags = [...new Set([...(s.story.flags || []), c.flag])]; return c.apply(s); },
      after: c.after,
    })),
  };
}

/** The payday advance comes back for its money on the day it said it would. */
export function storyDueCard(state) {
  const sto = state.story || {};
  if (!sto.advanceDueDay || sto.advanceDueDay !== state.day || !sto.advanceOwed) return null;
  return {
    tier: 2, label: 'THE PAY APP',
    text: `The instant advance comes due: $${sto.advanceOwed} leaves your account this morning, whether or not rent is covered.`,
    effect: (s) => {
      const owed = s.story.advanceOwed;
      const paid = Math.min(owed, Math.max(0, s.cash));
      s.cash -= paid;
      s.story.advanceOwed = 0;
      if (paid < owed) { s.stress += 8; return `-$${paid}. Short by $${owed - paid}: the app adds a late fee notice. +8 stress`; }
      return `-$${owed}`;
    },
  };
}

/** The flags the player's choices set this month. */
export function storyFlags(state) { return (state.story && state.story.flags) || []; }

/** The month's story, read back: goal, the three choices, and the ending. */
export function storyEnding(state) {
  const st = storyOf(state);
  const met = st.goal.check(state);
  const choices = STORY_DAYS.map((d) => {
    const i = state.story?.choices?.[d];
    const beat = st.beats[d];
    return i === undefined ? null : { day: d, text: beat.choices[i].text };
  }).filter(Boolean);
  return { background: backgroundOf(state).name, goal: st.goal.text, met, progress: st.goal.progress(state), text: met ? st.endings.met : st.endings.missed, choices };
}
