// Tiny Firestore REST client. Two ways to sign in:
//  - asService(): a Firebase service account (Netlify env FIREBASE_SERVICE_ACCOUNT), used by the daily sender
//  - asUser(idToken): the signed-in user's own token, so Firestore's rules check it (used by Send a test)
import { createSign } from 'node:crypto';

const API = process.env.FIRESTORE_API || 'https://firestore.googleapis.com/v1';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';

// ---------- typed values ----------
export function decode(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  return null;
}
export function decodeFields(f) { const o = {}; for (const k in f || {}) o[k] = decode(f[k]); return o; }
export function encode(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(encode) } };
  return { mapValue: { fields: encodeFields(x) } };
}
export function encodeFields(o) { const f = {}; for (const k in o) f[k] = encode(o[k]); return f; }

// ---------- service account → access token ----------
let cached = null;
function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set in Netlify');
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON — paste the whole downloaded file'); }
  if (!sa.client_email || !sa.private_key || !sa.project_id) throw new Error('FIREBASE_SERVICE_ACCOUNT is missing client_email, private_key or project_id');
  sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  return sa;
}
async function serviceToken(sa) {
  if (cached && cached.exp > Date.now() + 60e3) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  const sig = b64url(createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key));
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google sign-in for the service account failed: ' + (j.error_description || j.error || r.status));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

// ---------- client ----------
function client(project, getToken) {
  const root = `projects/${project}/databases/(default)/documents`;
  async function call(method, url, body) {
    const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + await getToken(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 404 && method === 'GET') return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || ('Firestore ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  return {
    project,
    async get(path) { const d = await call('GET', `${API}/${root}/${path}`); return d ? decodeFields(d.fields) : null; },
    async list(path) {
      const out = []; let page = '';
      do {
        const d = await call('GET', `${API}/${root}/${path}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
        for (const doc of (d && d.documents) || []) out.push({ ...decodeFields(doc.fields), id: doc.name.split("/").pop(), _path: doc.name });
        page = d && d.nextPageToken;
      } while (page);
      return out;
    },
    async groupList(collectionId) {           // every <collectionId> subcollection in the database
      const rows = await call('POST', `${API}/${root}:runQuery`, { structuredQuery: { from: [{ collectionId, allDescendants: true }] } });
      return (rows || []).filter(x => x.document).map(x => ({ ...decodeFields(x.document.fields), id: x.document.name.split("/").pop(), _path: x.document.name }));
    },
    async patch(path, data) {                  // merge the given top-level fields
      const mask = Object.keys(data).map(k => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
      return call('PATCH', `${API}/${root}/${path}?${mask}`, { fields: encodeFields(data) });
    },
    async del(path) { return call('DELETE', `${API}/${root}/${path}`); },
  };
}
export function asService() { const sa = serviceAccount(); return client(sa.project_id, () => serviceToken(sa)); }
export function asUser(project, idToken) { return client(project, async () => idToken); }

// uid claimed in a Firebase ID token (only trusted after Firestore accepts the token)
export function uidFromToken(t) {
  try { const p = JSON.parse(Buffer.from(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); return p.user_id || p.sub || null; }
  catch (e) { return null; }
}
