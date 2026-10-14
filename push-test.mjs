// "Send a test" button: sends one notification to the device that asked.
// The person's own sign-in token is used to read their device, so Firestore's rules prove it's really them.
import webpush from 'web-push';
import { asUser, uidFromToken } from '../lib/firestore.mjs';
import { setupVapid } from '../lib/vapid.mjs';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });

export async function handle(body, { push = webpush, makeDb = asUser } = {}) {
  const { idToken, device } = body || {};
  if (!idToken || !device || !/^[A-Za-z0-9_-]{4,64}$/.test(device)) return json({ ok: false, error: 'Missing sign-in or device.' }, 400);
  const uid = uidFromToken(idToken);
  let project = null;
  try { project = JSON.parse(Buffer.from(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).aud; } catch (e) {}
  if (!uid || !project) return json({ ok: false, error: 'Sign-in not recognised. Sign out and in again.' }, 401);
  let dev;
  try { dev = await makeDb(project, idToken).get(`users/${uid}/push/${device}`); }
  catch (e) { return json({ ok: false, error: e.status === 401 || e.status === 403 ? 'Sign-in expired. Sign out and in again.' : 'Couldn\'t read your account: ' + e.message }, 401); }
  if (!dev || !dev.sub) return json({ ok: false, error: 'This device isn\'t registered. Tap "Turn off", then "Turn on" again.' }, 404);
  try { setupVapid(push); } catch (e) { return json({ ok: false, error: 'The reminder keys aren\'t set on your website (Netlify environment variables).' }, 500); }
  try {
    await push.sendNotification(dev.sub, JSON.stringify({ title: '🔔 Study Guide test', body: 'Reminders are working on your ' + (dev.name || 'device') + '.', tag: 'sg-test', url: './' }), { TTL: 600, urgency: 'high' });
    return json({ ok: true });
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) return json({ ok: false, error: 'This device\'s registration has expired. Tap "Turn off", then "Turn on" again.' }, 410);
    return json({ ok: false, error: 'Apple/Google refused the test (' + (e.statusCode || e.message) + ').' }, 502);
  }
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST' }, 405);
  let body = {};
  try { body = await req.json(); } catch (e) {}
  return handle(body);
};
