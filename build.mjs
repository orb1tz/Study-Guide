// Netlify runs this on every update (build command: node build.mjs).
//  1. puts files back in their folders if GitHub's web upload flattened them
//  2. copies the reminder key into the page and the guide's key dates into the reminder sender
//  3. locks the page with your code (Netlify setting GUIDE_CODE) and writes the website to dist/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto as crypto } from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const at = (...p) => path.join(ROOT, ...p);
const log = (...a) => console.log('[build]', ...a);
function fail(msg) { console.error('\n[build] ✖ ' + msg + '\n'); process.exit(1); }

// ---------- 1. repair a flattened upload ----------
const PLACES = {
  'index.html': 'site', 'sw.js': 'site', 'manifest.webmanifest': 'site', '_headers': 'site', 'robots.txt': 'site',
  'icon-192.png': 'site/icons', 'icon-512.png': 'site/icons', 'icon-maskable-512.png': 'site/icons', 'apple-touch-icon.png': 'site/icons',
  'push-daily.mjs': 'netlify/functions', 'push-test.mjs': 'netlify/functions',
  'firestore.mjs': 'netlify/lib', 'digest.mjs': 'netlify/lib', 'keydates.mjs': 'netlify/lib', 'vapid.mjs': 'netlify/lib',
};
export function repair(root = ROOT) {
  let moved = 0;
  for (const [name, dir] of Object.entries(PLACES)) {
    const flat = path.join(root, name), proper = path.join(root, dir, name);
    if (fs.existsSync(flat) && !fs.existsSync(proper)) { fs.mkdirSync(path.join(root, dir), { recursive: true }); fs.renameSync(flat, proper); moved++; }
  }
  return moved;
}

// ---------- helpers ----------
const b64 = buf => Buffer.from(buf).toString('base64');
export function extractKeyDates(html) {
  const m = html.match(/const KEY_DATES = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('Could not find KEY_DATES in site/index.html');
  return vm.runInNewContext(m[1]);
}
export async function lock(html, code, saltB64, iterations = 600000) {
  const salt = Buffer.from(saltB64, 'base64');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html));
  return JSON.stringify({ s: b64(salt), i: b64(iv), n: iterations, c: b64(ct) });
}
function copyDir(src, dst, skip = new Set()) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// ---------- build ----------
export async function build({ root = ROOT, env = process.env } = {}) {
  const moved = repair(root);
  if (moved) log(`moved ${moved} flattened file(s) back into their folders`);
  const src = path.join(root, 'site', 'index.html');
  if (!fs.existsSync(src)) fail('site/index.html is missing. Upload the whole "site" folder to GitHub.');
  let html = fs.readFileSync(src, 'utf8');

  // reminder key → page
  const vapid = (env.VAPID_PUBLIC_KEY || '').trim();
  if (vapid) html = html.replace('__VAPID_PUBLIC_KEY__', vapid);
  else log('⚠ VAPID_PUBLIC_KEY not set — the site works, but reminders stay off until you add it in Netlify');

  // key dates → reminder sender (same list the page shows)
  const dates = extractKeyDates(html);
  fs.mkdirSync(path.join(root, 'netlify', 'lib'), { recursive: true });
  fs.writeFileSync(path.join(root, 'netlify', 'lib', 'keydates.mjs'),
    '// Made by build.mjs from KEY_DATES in site/index.html — edit the dates there, not here.\nexport const KEY_DATES = ' + JSON.stringify(dates, null, 1) + ';\n');
  log(`${dates.length} key dates copied to the reminder sender`);

  // lock
  const code = (env.GUIDE_CODE || '').trim();
  if (!code) fail('GUIDE_CODE is not set. In Netlify: Site configuration → Environment variables → add GUIDE_CODE with your unlock code.');
  const saltFile = path.join(root, 'lock-salt.txt');
  if (!fs.existsSync(saltFile)) fail('lock-salt.txt is missing. Upload it to GitHub (it keeps your code working across updates).');
  const payload = await lock(html, code, fs.readFileSync(saltFile, 'utf8').trim());
  const shell = fs.readFileSync(path.join(root, 'lock-shell.html'), 'utf8');
  const out = path.join(root, 'dist');
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(path.join(root, 'site'), out, new Set(['index.html']));
  fs.writeFileSync(path.join(out, 'index.html'), shell.replace('__PAYLOAD__', () => payload));
  log('locked site written to dist/');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  build().catch(e => fail(e.message));
}
