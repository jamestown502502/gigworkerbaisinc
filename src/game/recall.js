// Spaced recall (2026-10-02). A takeaway read once fades; one asked again a week later sticks
// (retrieval practice beats re-reading, and spacing beats massing). So on days 10, 17 and 24, the
// morning after each of Dee's weekly visits, a card asks about ONE lesson this run has already
// shown, never the same one twice. The answer is always explained; a right one eases a little
// stress. Shaped like a daily event with choices, so it rides the existing morning queue.
import { LESSONS } from './microgames.js';
import { FEELING_LESSON, THREAD_LESSON, BREATH_LESSON } from './qte.js';
import { CHOICE_TREES } from './choices.js';

const choiceLesson = (tree, text) => CHOICE_TREES[tree].flatMap((n) => n.choices || []).find((c) => c.text === text).lesson;

/** `options[0]` is the answer; the card shuffles the display order. */
export const RECALL_BANK = [
  { lesson: LESSONS.pack, q: 'Packing a car for a job. Where does the toolbox ride?', options: ['On the floor, low', 'On top, easy to grab', 'On the back seat'] },
  { lesson: LESSONS.lift, q: 'Lifting a couch with a partner. What comes first?', options: ['A count out loud, knees bent', 'Grab it and go', 'Lift fast with your back'] },
  { lesson: LESSONS.untangle, q: 'Four leashes in a knot. Which do you free first?', options: ['The one on top of the pile', 'The one at the bottom', 'The dog pulling hardest'] },
  { lesson: LESSONS.rake, q: 'Raking on a windy day. Where should the pile go?', options: ['Downwind', 'Upwind', 'Right in the middle'] },
  { lesson: LESSONS.proofread, q: 'Proofreading a flyer. What catches the most typos?', options: ['Reading slowly, word by word', 'Skimming it twice, fast', 'Reading for the meaning'] },
  { lesson: LESSONS.sort, q: 'A return with tags but no receipt. What does the store offer?', options: ['Store credit', 'A cash refund', 'Nothing at all'] },
  { lesson: LESSONS.assemble, q: 'Flat-pack furniture. What comes before the first screw?', options: ['Read every step, sort hardware', 'Hang the doors', 'Tighten the frame'] },
  { lesson: LESSONS.percent, q: 'Tip math, fast: what is 20% of $35?', options: ['$7', '$3.50', '$20'] },
  { lesson: LESSONS.frame, q: 'Photographing a mug that faces right. Where does it go?', options: ['On the left third', 'Dead center', 'On the right third'] },
  { lesson: FEELING_LESSON.suspicious, q: 'A wary client asks for your ID. Best response?', options: ['Show it, and offer to be paid after', 'Say you are not like the last one', 'Ask to skip it this time'] },
  { lesson: FEELING_LESSON.angry, q: 'A client is venting about three bad quotes. What first?', options: ['Name the frustration', 'Correct their numbers', 'Say nothing'] },
  { lesson: FEELING_LESSON.rushed, q: 'A rushed client has twenty minutes. What do you ask?', options: ['What matters most today', 'For more time', 'To stop rushing you'] },
  { lesson: THREAD_LESSON.client, q: 'An upset client texts you. What goes first in the reply?', options: ['Acknowledge them', 'Defend yourself', 'One word, keep it short'] },
  { lesson: THREAD_LESSON.friend, q: 'A friend calls after a bad week. What makes the call help?', options: ['Ask about them first', 'Share your bad week too', 'Keep it short'] },
  { lesson: BREATH_LESSON, q: 'Calming breath. Which part does the most work?', options: ['A long, slow out-breath', 'A quick, deep in-breath', 'Holding it as long as possible'] },
  { lesson: choiceLesson('creativeGig', 'Say tweaks are billable at hourly rate'), q: 'A design client keeps asking for "small tweaks". What prevents it?', options: ['Revision rounds agreed in writing', 'Doing every tweak to be nice', 'Ignoring the messages'] },
  { lesson: choiceLesson('movingHelp', 'Suggest hourly rate instead'), q: 'You cannot tell how big a job will be. Which rate protects you?', options: ['Hourly', 'A flat rate', 'Pay what you want'] },
  { lesson: choiceLesson('yardWork', 'Quote extra for the overgrowth'), q: 'The lawn is worse than the photo. When do you raise the quote?', options: ['Before you start', 'Halfway through', 'On the final bill'] },
  { lesson: choiceLesson('garageClean', 'Ask what stays and what goes first'), q: 'A cluttered garage, client watching. What do you do first?', options: ['Agree on what stays and goes', 'Start filling bags', 'Sort it all yourself later'] },
];

export const RECALL_DAYS = [10, 17, 24];

function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Questions about lessons this run has shown and not yet quizzed. */
export function recallCandidates(state) {
  const seen = state?.lessonsSeen || [];
  const done = state?.recallDone || [];
  return RECALL_BANK.filter((r) => seen.includes(r.lesson) && !done.includes(r.lesson));
}

/** Today's recall card, if today is a recall day and there is something to ask. */
export function recallCard(state, rand = Math.random) {
  if (!RECALL_DAYS.includes(state?.day)) return null;
  const pool = recallCandidates(state);
  if (!pool.length) return null;
  const r = pool[Math.floor(rand() * pool.length)];
  const mark = (s) => { s.recallDone = [...(s.recallDone || []), r.lesson]; };
  return {
    tier: 2,
    label: 'REMEMBER THIS?',
    text: r.q,
    choices: shuffle(r.options, rand).map((text) => {
      const right = text === r.options[0];
      return {
        text,
        after: `${right ? '' : `The answer: ${r.options[0]}. `}${r.lesson}`,
        apply: (s) => { mark(s); if (right) { s.stress -= 4; return 'Right. -4 stress'; } return 'Not quite.'; },
      };
    }),
  };
}
