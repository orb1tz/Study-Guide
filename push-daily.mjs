// Runs every 15 minutes. At each person's chosen time it sends one reminder with what's coming up.
import webpush from 'web-push';
import { asService } from '../lib/firestore.mjs';
import { dueItems, message, shouldSend } from '../lib/digest.mjs';
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
    const stateDoc = await db.get(`users/${uid}/notify/state`);
    const go = shouldSend(settings, stateDoc, now);
    if (!go.send) { report.push({ uid, skipped: go.reason }); continue; }
    const main = (await db.get(`users/${uid}`)) || {};
    const homework = await db.list(`users/${uid}/homework`);
    const custom = await db.list(`users/${uid}/custom`);
    const msg = message(dueItems({ today: go.date, leads: settings.leads || [7, 1, 0], state: main.state || {}, homework, custom }), go.date);
    let sent = 0;
    if (msg) for (const d of devs) {
      try { await push.sendNotification(d.sub, JSON.stringify(msg), { TTL: 6 * 3600, urgency: 'high' }); sent++; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { await db.del(`users/${uid}/push/${d.id}`); log(`removed expired device ${d.id}`); }
        else log(`send to ${d.id} failed: ${e.statusCode || ''} ${e.body || e.message}`);
      }
    }
    await db.patch(`users/${uid}/notify/state`, { lastSent: go.date, lastRun: Date.now(), lastCount: msg ? sent : 0 });
    report.push({ uid, date: go.date, message: msg && msg.title, sent });
  }
  return report;
}

export default async () => {
  try { const r = await run(); console.log(JSON.stringify(r)); return new Response('ok'); }
  catch (e) { console.error(e); return new Response('error: ' + e.message, { status: 500 }); }
};
export const config = { schedule: '*/15 * * * *' };
