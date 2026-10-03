// Social gigs open with an emotional-intelligence beat (see qte.js ReadClient / ThreadGame):
// a node with `minigame` runs that game first and then continues to `next`. Added 2026-09.
//
// Every choice now says what happened and why (2026-10-02). It used to resolve to one of three
// lines ("You handle it." / "It pays off." / "It backfires.") whatever the job, so a choice taught
// nothing and the client never answered. Now each choice carries:
//   say    - the client's reaction when it simply happens (no chance roll)
//   win    - the reaction when a `chance` roll lands (or a `bonus` is found)
//   lose   - the reaction when it does not
//   lesson - one real-world takeaway about the work itself: scoping, pricing, boundaries, safety.
// Elaborated feedback (the reason, not just the result) is the support that most reliably improves
// learning in games (Wouters & van Oostendorp, 2013). `{client}` is filled with the gig's client.
// Effects and odds are unchanged from before, so the Monte Carlo balance bands are unaffected.
export const CHOICE_TREES = {
  movingHelp: [
    { text: 'Client shows a truck packed floor-to-ceiling.', choices: [
      { text: 'Accept the overload', result: { cash: 20, energy: -15, stress: 10, rep: 0 }, next: null,
        say: '{client} slaps the truck. "Knew you\'d be up for it." Twenty extra dollars. Your back keeps the receipt.',
        lesson: 'Extra pay for extra load is a trade, not a gift. Price your energy before you say yes.' },
      { text: 'Offer to do 2 trips instead', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null,
        say: '{client} thinks it over and nods. Two trips, nothing dropped, nobody hurt.',
        lesson: 'Offering a safer plan, instead of a flat no, keeps the job and your reputation.' },
      { text: 'Suggest hourly rate instead', result: { cash: 30, energy: -10, stress: 5, rep: 0.1, chance: 0.6 }, next: null,
        win: '{client} agrees to hourly. The job runs long, and the meter runs with it.',
        lose: '{client} points at the listing: flat rate. You do it at the flat rate. No harm, no extra.',
        lesson: 'Hourly protects you when the size of a job is unknown. Ask before you start, not halfway.' },
    ]},
  ],
  waterSlide: [
    { text: 'The water slide towers 8 stories. Clipboard in hand.', choices: [
      { text: 'Just ride it — go with the flow', result: { cash: 0, energy: 5, stress: -5, rep: 0 }, next: null,
        say: 'Eight stories of screaming. Your whole review is one word: "Yes."',
        lesson: 'Some gigs are simply fun. Rest counts, even when it is paid.' },
      { text: 'Ask detailed safety questions', result: { cash: 0, energy: 0, stress: 0, rep: 0.3 }, next: 'safetyFollowUp',
        say: '{client} lights up. Nobody ever asks about the pumps.',
        lesson: 'Good questions show expertise before you have done any of the work.' },
      { text: 'Request a second ride for "accuracy"', result: { cash: 20, energy: 0, stress: 0, rep: 0, chance: 0.7 }, next: null,
        win: '"For accuracy," you say. {client} laughs and pays for the second ride too.',
        lose: '"One ride, one review," {client} says. Fair enough.',
        lesson: 'Asking for more rarely hurts if you ask lightly and take a no gracefully.' },
      { text: 'Film it for your channel', result: { cash: 0, energy: 0, stress: 5, rep: 0.2, chance: 0.7, failResult: { rep: -0.2 } }, next: null,
        win: 'The clip does numbers. {client} reposts it from the park\'s account.',
        lose: '{client} spots the phone. "Did you sign the media release?" You did not.',
        lesson: 'Get permission before posting a client\'s place or product. A release takes a minute.' },
    ]},
    { id: 'safetyFollowUp', text: 'The client walks you through the pump specs, visibly impressed by your diligence.', choices: [
      { text: 'Ride it with full confidence', result: { cash: 0, energy: 5, stress: -10, rep: 0.1 }, next: null,
        say: 'You ride knowing exactly what is holding you up. Best ride of your life.',
        lesson: 'Understanding how the work is done makes it less stressful to do.' },
      { text: 'Suggest a safety improvement', result: { cash: 15, energy: 0, stress: 0, rep: 0.2, chance: 0.6 }, next: null,
        win: '{client} writes your idea down and adds $15 for "consulting."',
        lose: '{client} nods politely. The idea goes nowhere, but you said it well.',
        lesson: 'Offer an improvement as a suggestion with its reason, never as a criticism.' },
    ]},
  ],
  cuddler: [
    { minigame: 'readclient', next: 'work' },
    { id: 'work', text: 'A nervous elderly client offers tea. The apartment is tidy but lonely.', choices: [
      { text: 'Set clear boundaries first', result: { cash: 0, energy: 0, stress: -5, rep: 0.3 }, next: null,
        say: 'You both agree on what is okay before anything starts. {client} visibly relaxes.',
        lesson: 'Clear boundaries up front protect both people. Clients trust you more for them.' },
      { text: 'Just chat for the hour', result: { cash: 0, energy: 5, stress: -10, rep: 0.1 }, next: null,
        say: '{client} talks about the 1970s for an hour. You now know how to fix a carburetor.',
        lesson: 'Sometimes the service people are really paying for is attention.' },
      { text: 'Try to upsell additional services', result: { cash: 0, energy: 0, stress: 10, rep: 0, chance: 0.4, failResult: { cash: 0, rep: -0.5 } }, next: null,
        win: '{client} books another visit next week, gladly.',
        lose: '{client}\'s face falls. "Oh. I thought this was friendlier." The hour ends early.',
        lesson: 'Pushing a sale on someone lonely costs more trust than it earns. Offer, never push.' },
    ]},
  ],
  yardWork: [
    { text: 'The client\'s lawn is overgrown and the mower looks ancient.', choices: [
      { text: 'Tough it out with the old mower', result: { cash: 0, energy: -10, stress: 5, rep: 0 }, next: null,
        say: 'The mower dies and restarts eleven times. The lawn gets done. You feel it.',
        lesson: 'Bad tools cost energy. Count the equipment when you price a job.' },
      { text: 'Ask if they have a newer mower', result: { cash: 0, energy: -5, stress: 0, rep: 0.1, chance: 0.7 }, next: null,
        win: '{client} wheels out a mower from this decade. Night and day.',
        lose: '"That is the mower," {client} says. It is, indeed, the mower.',
        lesson: 'Asking what tools the client has is part of quoting, not a favor.' },
      { text: 'Quote extra for the overgrowth', result: { cash: 20, energy: -10, stress: 0, rep: 0, chance: 0.5, failResult: { rep: -0.3 } }, next: null,
        win: '{client} looks at the jungle and agrees: $20 more is fair.',
        lose: '{client} says the photo showed the grass. Did you look at the photo? You did not.',
        lesson: 'Quote extra before you start. Raising the price after you arrive feels like a bait and switch.' },
    ]},
  ],
  dogWalking: [
    { text: 'The husky is full of energy and the leash is flimsy.', choices: [
      { text: 'Take it slow, build trust first', result: { cash: 0, energy: -5, stress: -5, rep: 0.2 }, next: null,
        say: 'Ten minutes of sniffing and the husky decides you are pack. The rest is easy.',
        lesson: 'Earning trust first, with dogs and with people, makes the hard part shorter.' },
      { text: 'Let it run — burn off that energy', result: { cash: 0, energy: -15, stress: 5, rep: 0 }, next: null,
        say: 'The husky runs. You run. The husky wins.',
        lesson: 'A dog that pulls is how leashes snap and walkers get hurt. Short leash, calm pace.' },
      { text: 'Use your own leash from inventory', result: { cash: 0, energy: -8, stress: -3, rep: 0.3, requireItem: 'leash' }, next: null,
        say: 'Your sturdy leash clicks on. {client} notices and asks for your number.',
        lesson: 'Bringing your own reliable gear is a quiet way to look professional.' },
    ]},
  ],
  creativeGig: [
    { minigame: 'textback', next: 'work' },
    { id: 'work', text: 'Client loves the first draft. "Can you just add... a few small tweaks?"', choices: [
      { text: 'Agree to small tweaks — stay friendly', result: { cash: 0, energy: -5, stress: 5, rep: 0.2 }, next: null,
        say: 'Three "small" tweaks become nine. {client} is thrilled. You are tired.',
        lesson: 'Unlimited revisions is how creative work stops paying. Agree on a number up front.' },
      { text: 'Say tweaks are billable at hourly rate', result: { cash: 30, energy: -5, stress: 0, rep: 0, chance: 0.6 }, next: null,
        win: '{client} agrees. The tweaks get smaller the moment they cost money.',
        lose: '{client} says edits were part of the quote. You let it go: unpaid, but unbothered.',
        lesson: 'Put revisions in writing: "two rounds included, then hourly" prevents this talk.' },
      { text: 'Politely decline, deliver as-is', result: { cash: 0, energy: 0, stress: -5, rep: -0.1 }, next: null,
        say: '{client} is a little stung, but the file is good and the job is done.',
        lesson: 'Delivering what was agreed is fair. Explaining why, kindly, keeps the client.' },
    ]},
  ],
  furnitureAssembly: [
    { minigame: 'textback', next: 'work' },
    { id: 'work', text: 'The box contains 300 pieces and the instructions are in Swedish.', choices: [
      { text: 'Methodical — sort every piece first', result: { cash: 0, energy: -12, stress: -5, rep: 0.2 }, next: null,
        say: 'Every screw in its own pile. The build goes together like it wants to.',
        lesson: 'Sorting the hardware is five minutes slower at the start and an hour faster overall.' },
      { text: 'Wing it — you\'ve done this before', result: { cash: 0, energy: -8, stress: 5, rep: 0, chance: 0.8, failResult: { rep: -0.3 } }, next: null,
        win: 'You have built this exact wardrobe before. Record time.',
        lose: 'Step 14 needs the panel you put on backwards in step 3. {client} watches you undo it.',
        lesson: 'Read every step before the first screw. Early mistakes get buried under later steps.' },
      { text: 'Use phone for AR assembly guide', result: { cash: 0, energy: -6, stress: 0, rep: 0.1 }, next: null,
        say: 'The phone guide walks you through it. Not glamorous. Totally correct.',
        lesson: 'Using the help that exists is not cheating. It is the job.' },
    ]},
  ],
  mysteryShop: [
    { text: 'The store manager keeps eyeing you suspiciously.', choices: [
      { text: 'Play the role — browse naturally', result: { cash: 0, energy: 0, stress: 5, rep: 0.3 }, next: null,
        say: 'You browse like anyone else and catch everything the staff do right and wrong.',
        lesson: 'Mystery shopping only works if staff do not know. Blending in is the skill.' },
      { text: 'Take detailed notes openly', result: { cash: 0, energy: 0, stress: 0, rep: 0.1, chance: 0.5, failResult: { rep: -0.2 } }, next: null,
        win: 'Nobody notices. Your report is full of detail.',
        lose: 'The manager suddenly becomes very helpful. Your report is useless.',
        lesson: 'People act differently when they know they are watched. Take notes after, not during.' },
      { text: 'Buy something small as cover', result: { cash: -10, energy: 0, stress: -5, rep: 0.4 }, next: null,
        say: 'You buy gum. The cashier upsells you on more gum. It all goes in the report.',
        lesson: 'A real purchase tests the whole service, checkout included.' },
    ]},
  ],
  mattressTest: [
    { text: 'The hotel room is surprisingly luxurious. The bed beckons.', choices: [
      { text: 'Scientific approach — test all positions', result: { cash: 0, energy: 10, stress: -10, rep: 0.3 }, next: null,
        say: 'Back, side, stomach, starfish. Your report has a table. {client} loves the table.',
        lesson: 'Structure makes even a silly job valuable. Clients pay for findings they can use.' },
      { text: 'Just nap and write a short review', result: { cash: 0, energy: 15, stress: -15, rep: 0 }, next: null,
        say: 'You sleep like a stone. The review is three words long.',
        lesson: 'Rest is real recovery. But a thin report earns fewer callbacks.' },
      { text: 'Check for hidden cameras first', result: { cash: 0, energy: 0, stress: 5, rep: 0.1, chance: 0.3, bonus: { rep: 1, cash: 200 } }, next: null,
        win: 'Behind the smoke detector: a camera that should not be there. The hotel is horrified, then very grateful.',
        lose: 'Nothing hidden. Just a very nice room.',
        lesson: 'Trust your instincts about safety. Checking a room takes two minutes.' },
    ]},
  ],
  photoGig: [
    { minigame: 'readclient', next: 'work' },
    { id: 'work', text: 'Client\'s product is smaller and shinier than expected.', choices: [
      { text: 'Adjust lighting, shoot against dark BG', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null,
        say: 'Dark backdrop, light from the side, no glare. {client} uses your shot as the main image.',
        lesson: 'Shiny things reflect everything. Light from the side and shoot against a dark background.' },
      { text: 'Suggest they hire a pro for this', result: { cash: 0, energy: 0, stress: 0, rep: 0.3 }, next: null,
        say: '{client} is surprised by the honesty, and books you for a different job.',
        lesson: 'Being honest about your limits builds more trust than winging it.' },
      { text: 'Shoot as-is, offer to reshoot later', result: { cash: 0, energy: -8, stress: 5, rep: 0 }, next: null,
        say: 'The shots are fine. The reshoot is not fine. It is unpaid.',
        lesson: '"I\'ll fix it later" usually means doing the job twice for one paycheck.' },
    ]},
  ],
  tutoring: [
    { minigame: 'readclient', next: 'work' },
    { id: 'work', text: 'The student is struggling and embarrassed about it.', choices: [
      { text: 'Start from basics, build confidence', result: { cash: 0, energy: -8, stress: -5, rep: 0.3 }, next: null,
        say: 'Back to fractions. By the end, the student is explaining it to you.',
        lesson: 'A struggling learner usually has a gap further back. Fill it and the rest gets easier.' },
      { text: 'Push through the homework fast', result: { cash: 0, energy: -5, stress: 5, rep: 0 }, next: null,
        say: 'The homework gets done. The understanding does not.',
        lesson: 'Finishing the worksheet is not the same as learning it.' },
      { text: 'Use a creative metaphor to explain', result: { cash: 0, energy: -10, stress: -8, rep: 0.4 }, next: null,
        say: 'Pizza slices. It clicks. You both laugh at how simple it was.',
        lesson: 'A concrete example beats repeating the rule louder.' },
    ]},
  ],
  rushShift: [
    { text: 'The app pings: "Busy night! Finish 10 orders in 3 hours for a $15 bonus."', choices: [
      { text: 'Chase the bonus', result: { cash: 0, energy: -5, stress: 6, rep: 0 }, next: null,
        say: 'You do the math in the parking lot: 10 orders in 3 hours means taking every ping, good or bad.',
        lesson: 'Quest bonuses are built to keep you online taking low orders. Count what the bad ones cost first.' },
      { text: 'Set a minimum: about $1 a mile', result: { cash: 0, energy: 0, stress: -3, rep: 0 }, next: null,
        say: 'You write "$1/mi" on a sticky note and put it on the dash.',
        lesson: 'A minimum per mile covers gas and wear with something left. Decide it before the first ping.' },
      { text: 'Fill the tank before the rush', result: { cash: -5, energy: 0, stress: -4, rep: 0.1 }, next: null,
        say: 'A full tank and a cold coffee. You are the calmest driver in the lot.',
        lesson: 'Gas is a business cost. Track it per mile, or you will think you earned more than you did.' },
    ]},
  ],
  marketDay: [
    { text: 'The organizer points you to the last open table, right by the entrance.', choices: [
      { text: 'Price everything before doors open', result: { cash: 0, energy: -3, stress: -3, rep: 0.1 }, next: null,
        say: 'Every tag written, every price a little above what you would take.',
        lesson: 'A clear price tag anchors the haggle. Start a little above the price you actually want.' },
      { text: 'Figure out prices as you go', result: { cash: 0, energy: 0, stress: 4, rep: 0 }, next: null,
        say: 'The first buyer asks "how much?" and you hear yourself say a number far too low.',
        lesson: 'Naming a price on the spot usually means naming it low. Decide your numbers in advance.' },
      { text: 'Make a "3 for $20" sign for small stuff', result: { cash: 0, energy: -2, stress: 0, rep: 0.2 }, next: null,
        say: 'The sign pulls people over. Two of them buy things they did not come for.',
        lesson: 'Bundles move low-value items and raise what each buyer spends.' },
    ]},
  ],
  garageClean: [
    { text: 'The garage is a hoarder\'s dream and the client is watching.', choices: [
      { text: 'Ask what stays and what goes first', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null,
        say: '{client} spends ten minutes deciding, and you save an hour of re-sorting.',
        lesson: 'Agree on the plan before you start. Ten minutes of questions saves an hour of redo.' },
      { text: 'Just fill bags — sort later', result: { cash: 0, energy: -15, stress: 5, rep: 0 }, next: null,
        say: 'Fast. Then {client} finds the wedding album in a trash bag.',
        lesson: 'Speed without a plan creates more work, and sometimes heartbreak.' },
      { text: 'Offer to organize for extra $', result: { cash: 25, energy: -20, stress: 0, rep: 0.1, chance: 0.5 }, next: null,
        win: '{client} says yes. Shelves, labels, done. $25 extra.',
        lose: '{client} says the budget is the budget. You clean it to plan.',
        lesson: 'An upsell lands best when it solves a problem the client can see right now.' },
    ]},
  ],
};

export function getNode(treeName, idOrIndex = 0) {
  const tree = CHOICE_TREES[treeName];
  if (!tree) return null;
  if (typeof idOrIndex === 'number') return tree[idOrIndex] || null;
  return tree.find((n) => n.id === idOrIndex) || null;
}

/** Fills {client} in a reaction line. */
export function fillClient(text, client) {
  return (text || '').replace(/\{client\}/g, client || 'The client');
}

// Applies a choice's result to state. Returns { effects, outcomeText, lesson, landed }.
// Semantics: `chance` gates the result (failResult on miss); if `bonus`
// exists, base result always applies and `chance` gates only the bonus.
// `outcomeText` is the client's reaction ({client} still unfilled; see fillClient).
export function resolveChoice(state, choice) {
  const r = choice.result || {};
  const roll = Math.random();
  let effects = {};
  let outcomeText = '';
  let landed = true;

  if (r.bonus) {
    effects = addEffects(effects, r);
    if (roll < (r.chance ?? 1)) {
      effects = addEffects(effects, r.bonus);
      outcomeText = choice.win || 'Incredible find! The story alone is worth it.';
    } else {
      landed = false;
      outcomeText = choice.lose || 'Nothing unusual. Job done.';
    }
  } else if (r.chance !== undefined) {
    if (roll < r.chance) {
      effects = addEffects(effects, r);
      outcomeText = choice.win || 'It pays off.';
    } else {
      landed = false;
      effects = addEffects(effects, r.failResult || {});
      outcomeText = choice.lose || 'It backfires.';
    }
  } else {
    effects = addEffects(effects, r);
    outcomeText = choice.say || 'You handle it.';
  }

  state.cash += effects.cash || 0;
  state.energy += effects.energy || 0;
  state.stress += effects.stress || 0;
  state.reputation += effects.rep || 0;
  state.clamp();
  return { effects, outcomeText, lesson: choice.lesson || '', landed };
}

function addEffects(acc, r) {
  return {
    cash: (acc.cash || 0) + (r.cash || 0),
    energy: (acc.energy || 0) + (r.energy || 0),
    stress: (acc.stress || 0) + (r.stress || 0),
    rep: (acc.rep || 0) + (r.rep || 0),
  };
}
