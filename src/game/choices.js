export const CHOICE_TREES = {
  movingHelp: [
    { text: 'Client shows a truck packed floor-to-ceiling.', choices: [
      { text: 'Accept the overload', result: { cash: 20, energy: -15, stress: 10, rep: 0 }, next: null },
      { text: 'Offer to do 2 trips instead', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null },
      { text: 'Suggest hourly rate instead', result: { cash: 30, energy: -10, stress: 5, rep: 0.1, chance: 0.6 }, next: null },
    ]},
  ],
  waterSlide: [
    { text: 'The water slide towers 8 stories. Clipboard in hand.', choices: [
      { text: 'Just ride it — go with the flow', result: { cash: 0, energy: 5, stress: -5, rep: 0 }, next: null },
      { text: 'Ask detailed safety questions', result: { cash: 0, energy: 0, stress: 0, rep: 0.3 }, next: 'safetyFollowUp' },
      { text: 'Request a second ride for "accuracy"', result: { cash: 20, energy: 0, stress: 0, rep: 0, chance: 0.7 }, next: null },
      { text: 'Film it for your channel', result: { cash: 0, energy: 0, stress: 5, rep: 0.2, chance: 0.7, failResult: { rep: -0.2 } }, next: null },
    ]},
    { id: 'safetyFollowUp', text: 'The client walks you through the pump specs, visibly impressed by your diligence.', choices: [
      { text: 'Ride it with full confidence', result: { cash: 0, energy: 5, stress: -10, rep: 0.1 }, next: null },
      { text: 'Suggest a safety improvement', result: { cash: 15, energy: 0, stress: 0, rep: 0.2, chance: 0.6 }, next: null },
    ]},
  ],
  cuddler: [
    { text: 'A nervous elderly client offers tea. The apartment is tidy but lonely.', choices: [
      { text: 'Set clear boundaries first', result: { cash: 0, energy: 0, stress: -5, rep: 0.3 }, next: null },
      { text: 'Just chat for the hour', result: { cash: 0, energy: 5, stress: -10, rep: 0.1 }, next: null },
      { text: 'Try to upsell additional services', result: { cash: 0, energy: 0, stress: 10, rep: 0, chance: 0.4, failResult: { cash: 0, rep: -0.5 } }, next: null },
    ]},
  ],
  yardWork: [
    { text: 'The client\'s lawn is overgrown and the mower looks ancient.', choices: [
      { text: 'Tough it out with the old mower', result: { cash: 0, energy: -10, stress: 5, rep: 0 }, next: null },
      { text: 'Ask if they have a newer mower', result: { cash: 0, energy: -5, stress: 0, rep: 0.1, chance: 0.7 }, next: null },
      { text: 'Quote extra for the overgrowth', result: { cash: 20, energy: -10, stress: 0, rep: 0, chance: 0.5, failResult: { rep: -0.3 } }, next: null },
    ]},
  ],
  dogWalking: [
    { text: 'The husky is full of energy and the leash is flimsy.', choices: [
      { text: 'Take it slow, build trust first', result: { cash: 0, energy: -5, stress: -5, rep: 0.2 }, next: null },
      { text: 'Let it run — burn off that energy', result: { cash: 0, energy: -15, stress: 5, rep: 0 }, next: null },
      { text: 'Use your own leash from inventory', result: { cash: 0, energy: -8, stress: -3, rep: 0.3, requireItem: 'leash' }, next: null },
    ]},
  ],
  creativeGig: [
    { text: 'Client loves the first draft. "Can you just add... a few small tweaks?"', choices: [
      { text: 'Agree to small tweaks — stay friendly', result: { cash: 0, energy: -5, stress: 5, rep: 0.2 }, next: null },
      { text: 'Say tweaks are billable at hourly rate', result: { cash: 30, energy: -5, stress: 0, rep: 0, chance: 0.6 }, next: null },
      { text: 'Politely decline, deliver as-is', result: { cash: 0, energy: 0, stress: -5, rep: -0.1 }, next: null },
    ]},
  ],
  furnitureAssembly: [
    { text: 'The box contains 300 pieces and the instructions are in Swedish.', choices: [
      { text: 'Methodical — sort every piece first', result: { cash: 0, energy: -12, stress: -5, rep: 0.2 }, next: null },
      { text: 'Wing it — you\'ve done this before', result: { cash: 0, energy: -8, stress: 5, rep: 0, chance: 0.8, failResult: { rep: -0.3 } }, next: null },
      { text: 'Use phone for AR assembly guide', result: { cash: 0, energy: -6, stress: 0, rep: 0.1 }, next: null },
    ]},
  ],
  mysteryShop: [
    { text: 'The store manager keeps eyeing you suspiciously.', choices: [
      { text: 'Play the role — browse naturally', result: { cash: 0, energy: 0, stress: 5, rep: 0.3 }, next: null },
      { text: 'Take detailed notes openly', result: { cash: 0, energy: 0, stress: 0, rep: 0.1, chance: 0.5, failResult: { rep: -0.2 } }, next: null },
      { text: 'Buy something small as cover', result: { cash: -10, energy: 0, stress: -5, rep: 0.4 }, next: null },
    ]},
  ],
  mattressTest: [
    { text: 'The hotel room is surprisingly luxurious. The bed beckons.', choices: [
      { text: 'Scientific approach — test all positions', result: { cash: 0, energy: 10, stress: -10, rep: 0.3 }, next: null },
      { text: 'Just nap and write a short review', result: { cash: 0, energy: 15, stress: -15, rep: 0 }, next: null },
      { text: 'Check for hidden cameras first', result: { cash: 0, energy: 0, stress: 5, rep: 0.1, chance: 0.3, bonus: { rep: 1, cash: 200 } }, next: null },
    ]},
  ],
  photoGig: [
    { text: 'Client\'s product is smaller and shinier than expected.', choices: [
      { text: 'Adjust lighting, shoot against dark BG', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null },
      { text: 'Suggest they hire a pro for this', result: { cash: 0, energy: 0, stress: 0, rep: 0.3 }, next: null },
      { text: 'Shoot as-is, offer to reshoot later', result: { cash: 0, energy: -8, stress: 5, rep: 0 }, next: null },
    ]},
  ],
  tutoring: [
    { text: 'The student is struggling and embarrassed about it.', choices: [
      { text: 'Start from basics, build confidence', result: { cash: 0, energy: -8, stress: -5, rep: 0.3 }, next: null },
      { text: 'Push through the homework fast', result: { cash: 0, energy: -5, stress: 5, rep: 0 }, next: null },
      { text: 'Use a creative metaphor to explain', result: { cash: 0, energy: -10, stress: -8, rep: 0.4 }, next: null },
    ]},
  ],
  garageClean: [
    { text: 'The garage is a hoarder\'s dream and the client is watching.', choices: [
      { text: 'Ask what stays and what goes first', result: { cash: 0, energy: -5, stress: 0, rep: 0.2 }, next: null },
      { text: 'Just fill bags — sort later', result: { cash: 0, energy: -15, stress: 5, rep: 0 }, next: null },
      { text: 'Offer to organize for extra $', result: { cash: 25, energy: -20, stress: 0, rep: 0.1, chance: 0.5 }, next: null },
    ]},
  ],
};

export function getNode(treeName, idOrIndex = 0) {
  const tree = CHOICE_TREES[treeName];
  if (!tree) return null;
  if (typeof idOrIndex === 'number') return tree[idOrIndex] || null;
  return tree.find((n) => n.id === idOrIndex) || null;
}

// Applies a choice's result to state. Returns { effects, outcomeText }.
// Semantics: `chance` gates the result (failResult on miss); if `bonus`
// exists, base result always applies and `chance` gates only the bonus.
export function resolveChoice(state, choice) {
  const r = choice.result || {};
  const roll = Math.random();
  let effects = {};
  let outcomeText = '';

  if (r.bonus) {
    effects = addEffects(effects, r);
    if (roll < (r.chance ?? 1)) {
      effects = addEffects(effects, r.bonus);
      outcomeText = 'Incredible find! The story alone is worth it.';
    } else {
      outcomeText = 'Nothing unusual. Job done.';
    }
  } else if (r.chance !== undefined) {
    if (roll < r.chance) {
      effects = addEffects(effects, r);
      outcomeText = 'It pays off.';
    } else {
      effects = addEffects(effects, r.failResult || {});
      outcomeText = 'It backfires.';
    }
  } else {
    effects = addEffects(effects, r);
    outcomeText = 'You handle it.';
  }

  state.cash += effects.cash || 0;
  state.energy += effects.energy || 0;
  state.stress += effects.stress || 0;
  state.reputation += effects.rep || 0;
  state.clamp();
  return { effects, outcomeText };
}

function addEffects(acc, r) {
  return {
    cash: (acc.cash || 0) + (r.cash || 0),
    energy: (acc.energy || 0) + (r.energy || 0),
    stress: (acc.stress || 0) + (r.stress || 0),
    rep: (acc.rep || 0) + (r.rep || 0),
  };
}
