// The week at a glance (publisher polish 2026-10-12): today and the next seven days as columns (eight,
// because the bills night can be seven days out: day 1's rent lands on day 8), so the rent
// deadline reads as a plan rather than a countdown. Pure: screens.js weekModal draws it, the tests
// hold it to the bill engine. It shows only what the game KNOWS will happen (bills, bookings,
// story and recall mornings, Dee, the month's end, eviction while rent is overdue); money it can
// only estimate (your pace) is the forecast line, labelled as an estimate, never a cell.
import { STORY_DAYS } from './story.js';
import { RECALL_DAYS } from './recall.js';
import { NEIGHBOR_BEATS } from './neighbor.js';
import { daysToEviction } from './depth.js';
import { RUN_LENGTH_DAYS } from '../engine/state.js';

/** `bills`: { rent, phone, food } due on the next bills evening (rent 0 when prepaid). */
export function weekPlan(s, bills) {
  const billsDay = s.day + Math.max(0, s.daysUntilBills);
  const evictionDay = s.unpaidRent > 0 ? s.day + daysToEviction(s) : null;
  const days = [];
  for (let d = s.day; d < s.day + 8; d++) {
    const items = [];
    if (d > RUN_LENGTH_DAYS) { days.push({ day: d, today: false, items: [{ kind: 'known', text: 'After the month' }] }); continue; }
    if (d === billsDay) {
      const total = bills.rent + bills.phone + bills.food;
      items.push({ kind: 'bill', text: `Bills $${total}` });
      if (bills.rent > 0) items.push({ kind: 'bill', text: `rent $${bills.rent}` });
    }
    if (evictionDay !== null && d === evictionDay) items.push({ kind: 'warn', text: 'Eviction if rent is unpaid' });
    for (const c of s.contracts || []) {
      if (d >= c.nextDay && (d - c.nextDay) % c.every === 0) items.push({ kind: 'known', text: `${c.client}: booked $${c.payout}` });
    }
    if (STORY_DAYS.includes(d)) items.push({ kind: 'known', text: 'Story morning' });
    if (RECALL_DAYS.includes(d)) items.push({ kind: 'known', text: 'Recall quiz' });
    if (NEIGHBOR_BEATS[d]) items.push({ kind: 'known', text: 'Dee drops by' });
    if (d === RUN_LENGTH_DAYS) items.push({ kind: 'known', text: 'Last day' });
    days.push({ day: d, today: d === s.day, items });
  }
  return days;
}
