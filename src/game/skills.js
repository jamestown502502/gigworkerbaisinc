// The skill each challenge teaches (QA round 4 depth pass, 2026-10-10). Learning research says to
// name the objective before the practice and reflect on it after, so the count-in says what is
// being practised ("You'll practise: load planning"), the result card tags the lesson with the
// same name, and the month's debrief (screens.js debriefPage) gathers them in one place.
export const SKILLS = {
  'PACK!': 'Load planning',
  'LIFT!': 'Safe lifting',
  'UNTANGLE!': 'Working top-down',
  'RAKE!': 'Reading the weather',
  'PROOFREAD!': 'Careful reading',
  'SORT!': 'Return policies',
  'ASSEMBLE!': 'Plan before you build',
  'PERCENT!': 'Mental math',
  'FRAME!': 'Composition',
  'INSPECT!': 'Inspecting with a checklist',
  'BOUNDARIES!': 'Holding agreed terms',
  'COMPARE!': 'Comparing like for like',
  'RUSH!': 'Pay per mile and per hour',
  'MARKET!': 'Margin and reading buyers',
  'READ THE CLIENT': 'Reading people',
  'TEXT BACK': 'Calming an upset client',
  'WIND DOWN': 'Breathing to calm down',
};

/** The skill a challenge (by its on-screen name) practises, or '' for one without a named skill. */
export function skillFor(name) {
  if (typeof name === 'string' && name.startsWith('CALL ')) return 'Listening to a friend';   // the evening call
  return SKILLS[name] || '';
}

// Where each skill shows up outside the game (publisher polish 2026-10-12): the third step of the
// learning rubric every challenge now meets (a named skill, a usable rule, and this transfer line).
// A player who can name a second place a rule works has learned the rule, not the minigame.
// Shown under the lesson on the result card; held to the rubric by tests/unit/learning.test.js.
export const TRANSFER = {
  'Load planning': 'Packing a car, a suitcase or a moving truck: heavy and low first, fragile on top.',
  'Safe lifting': 'Moving furniture with a friend or a roommate: count out loud and lift together.',
  'Working top-down': 'Untangling cables, necklaces or a messy inbox: start from the top of the pile.',
  'Reading the weather': 'Any outdoor plan, from a yard job to a picnic: check the forecast again before you start.',
  'Careful reading': 'Contracts, leases and job offers: read slowly, word by word, before you sign.',
  'Return policies': 'Your own shopping: keep receipts and tags until you are sure, and ask about final sale first.',
  'Plan before you build': 'Any project with steps, from flat-pack furniture to a recipe: read it all first.',
  'Mental math': 'Tips, discounts and sales tax: find 10% first, then build the number you need.',
  'Composition': 'Photos for a listing, a profile or a portfolio: subject on a third line, space where it looks.',
  'Inspecting with a checklist': 'Renting a car or an apartment: walk it with a checklist and note every fault before you sign.',
  'Holding agreed terms': 'Any job or favor that starts to grow: point back to what was agreed, then decide together.',
  'Comparing like for like': 'Phone plans, apartments or job offers: list the same criteria for each, then match your needs.',
  'Pay per mile and per hour': 'Any gig or job offer: subtract your costs, then divide by every hour it really takes.',
  'Margin and reading buyers': 'Selling anything second-hand: know your cost, set a floor, and read what the buyer wants.',
  'Reading people': 'Customers, coworkers and friends: name what they seem to feel before you answer.',
  'Calming an upset client': 'Any complaint, at work or at home: acknowledge it first, then fix what you can.',
  'Breathing to calm down': 'Before an interview, an exam or a hard call: a few long, slow out-breaths.',
  'Listening to a friend': 'Any hard conversation: ask, listen, and let them finish before you give advice.',
};

/** The transfer line for a challenge (by its on-screen name), or ''. */
export function transferFor(name) {
  return TRANSFER[skillFor(name)] || '';
}
