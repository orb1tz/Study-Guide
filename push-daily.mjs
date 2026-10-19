// Runs every 15 minutes. Sends each item's pop-up at its own time (or your usual time), once.
import webpush from 'web-push';
import { asService } from '../lib/firestore.mjs';
import { localNow } from '../lib/digest.mjs';
import { KEY_DATES } from '../lib/keydates.mjs';
import { NotifCore } from '../lib/notifcore.mjs';
import { setupVapid } from '../lib/vapid.mjs';

export async function run({ db = asService(), push = webpush, now = new Date(), log = console.log } = {}) {
  setupVapid(push);
  const devices = await db.groupList('push');
  const byUser = new Map();
  for (const d of devices) {
    const m = d._path.match(/\/documents\/users\/([^/]+)\/push\/([^/]+)$/);
    if (!m || !d.sub || !d.sub.endpoint) continue;
    if (!byUser.has(m[1])) byUser.set(m[1], []);
    byUser.get(m[1]).push({ id: m[2], sub: d.sub, name: d.name });
  }
  const report = [];
  for (const [uid, devs] of byUser) {
    const settings = await db.get(`users/${uid}/notify/settings`);
    if (!settings || settings.on === false) { report.push({ uid, skipped: 'off' }); continue; }
    const { date, time } = localNow(settings.tz, now);
    const stateDoc = (await db.get(`users/${uid}/notify/state`)) || {};
    const sent = new Set(stateDoc.date === date && Array.isArray(stateDoc.sent) ? stateDoc.sent : []);
    const main = (await db.get(`users/${uid}`)) || {};
    const homework = await db.list(`users/${uid}/homework`);
    const custom = await db.list(`users/${uid}/custom`);
    const all = NotifCore.all({ keyDates: KEY_DATES, homework, custom, state: main.state || {} });
    const due = [];
    for (const it of all) {
      const d = NotifCore.dueToday(it, date, settings);
      if (d && d.time <= time && !sent.has(it.key)) due.push(Object.assign({ n: d.n }, it));
    }
    due.sort((a, b) => a.n - b.n);
    if (!due.length) {
      if (stateDoc.date !== date) await db.patch(`users/${uid}/notify/state`, { date, sent: [], lastRun: Date.now() });
      report.push({ uid, date, skipped: 'nothing due' });
      continue;
    }
    const msg = NotifCore.message(due, date);
    let delivered = 0;
    for (const d of devs) {
      try { await push.sendNotification(d.sub, JSON.stringify(msg), { TTL: 6 * 3600, urgency: 'high' }); delivered++; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await db.del(`users/${uid}/push/${d.id}`); log(`removed expired device ${d.id}`); }
        else log(`send to ${d.id} failed: ${e.statusCode || ''} ${e.body || e.message}`);
      }
    }
    due.forEach(i => sent.add(i.key));
    await db.patch(`users/${uid}/notify/state`, { date, sent: [...sent], lastRun: Date.now(), lastCount: delivered, lastSent: date });
    report.push({ uid, date, message: msg.title, items: due.map(i => i.key), sent: delivered });
  }
  return report;
}

export default async () => {
  try { const r = await run(); console.log(JSON.stringify(r)); return new Response('ok'); }
  catch (e) { console.error(e); return new Response('error: ' + e.message, { status: 500 }); }
};
export const config = { schedule: '*/15 * * * *' };
