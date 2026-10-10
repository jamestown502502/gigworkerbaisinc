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
