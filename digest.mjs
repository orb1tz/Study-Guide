// Works out what to remind about. Same rules as the 🔔 Notifications panel in the guide.
import { KEY_DATES } from './keydates.mjs';

export function localNow(tz, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Europe/Dublin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000);
}
function whenLabel(n) { return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 7 ? 'In a week' : `In ${n} days`; }

// state: the user's ticks {id: true}; homework: [{week, text, due, done}]
export function dueItems({ today, leads = [7, 1, 0], state = {}, homework = [], custom = [], keyDates = KEY_DATES }) {
  const items = [];
  for (const e of keyDates) {
    const n = daysBetween(today, e.date);
    if (!leads.includes(n)) continue;
    if (e.done && state[e.done]) continue;                 // already submitted
    items.push({ n, ico: e.ico, text: e.t, sub: e.sub });
  }
  for (const h of homework) {
    if (h.done || !h.due) continue;
    const n = daysBetween(today, h.due);
    if (!leads.includes(n)) continue;
    const label = (String(h.week).startsWith('pay') ? 'Payroll' : 'Bookkeeping') + ' W' + String(h.week).replace(/\D/g, '');
    items.push({ n, ico: '📝', text: 'Homework: ' + h.text, sub: label });
  }
  for (const c of custom) {
    if (c.kind !== 'notif' || c.done || !c.date) continue;
    const n = daysBetween(today, c.date);
    if (!leads.includes(n)) continue;
    items.push({ n, ico: '🔔', text: c.text, sub: 'Your notification' });
  }
  return items.sort((a, b) => a.n - b.n);
}

export function message(items, today) {
  if (!items.length) return null;
  if (items.length === 1) {
    const i = items[0];
    return { title: `${i.ico} ${i.text}`, body: `${whenLabel(i.n)} · ${i.sub}`, tag: 'sg-' + today, url: './' };
  }
  const body = items.slice(0, 6).map(i => `${whenLabel(i.n)}: ${i.text}`).join('\n') + (items.length > 6 ? `\n+${items.length - 6} more` : '');
  return { title: `📚 ${items.length} things coming up`, body, tag: 'sg-' + today, url: './' };
}

// Should this user get today's reminder now?
export function shouldSend(settings, stateDoc, now = new Date()) {
  if (!settings || settings.on === false) return { send: false, reason: 'off' };
  const { date, time } = localNow(settings.tz, now);
  if (time < (settings.time || '08:00')) return { send: false, reason: 'too early', date };
  if (stateDoc && stateDoc.lastSent === date) return { send: false, reason: 'already sent', date };
  return { send: true, date };
}
