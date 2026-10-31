// Study Guide widgets — build step.
//   node widgets-build.mjs pre    (before build.mjs) adds a small helper to the page on Netlify's build computer only
//   node widgets-build.mjs post   (after build.mjs)  adds mini.html, the Widgets board files and the service-worker code to dist/
// It never changes your files on GitHub, and it never stops your site from building: if something is missing it skips that part and says why.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, 'widgets-src');
const site = path.join(root, 'site');
const dist = path.join(root, 'dist');
const mode = process.argv[2] || 'post';
const log = (...a) => console.log('[widgets]', ...a);
const read = p => fs.readFileSync(p, 'utf8');
const MARK = '/*SG-WIDGETS-HELPER*/';

function between(text, a, b){ const i = text.indexOf(a), j = text.indexOf(b, i + a.length); return i >= 0 && j > i ? text.slice(i + a.length, j) : null; }
function notifCore(html){
  const inPage = html ? between(html, '/*NOTIFCORE-START*/', '/*NOTIFCORE-END*/') : null;
  if(inPage && /NotifCore/.test(inPage)) return inPage;
  log('using the bundled copy of the reminder rules');
  return between(read(path.join(src, 'notifcore-fallback.js')), '/*NOTIFCORE-START*/', '/*NOTIFCORE-END*/');
}
const miniCore = () => between(read(path.join(src, 'minicore.js')), '/*MINICORE-START*/', '/*MINICORE-END*/');

// read `const NAME = [...]` / `{...}` out of the page's script
function readConst(html, name){
  const m = new RegExp('const\\s+' + name + '\\s*=\\s*').exec(html);
  if(!m) return undefined;
  let i = m.index + m[0].length, depth = 0, q = null, out = '';
  for(; i < html.length; i++){
    const ch = html[i];
    out += ch;
    if(q){ if(ch === '\\'){ out += html[++i]; continue; } if(ch === q) q = null; continue; }
    if(ch === '"' || ch === "'" || ch === '`'){ q = ch; continue; }
    if('[{('.includes(ch)) depth++;
    else if(']})'.includes(ch)){ depth--; if(depth === 0) break; }
  }
  try { return vm.runInNewContext('(' + out + ')', {}, {timeout: 1000}); } catch(e){ log('could not read', name, '-', e.message); return undefined; }
}
function courseData(html){
  const pick = w => ({n: w.n, strand: w.strand, date: w.date, lo: w.lo, title: w.title, study: w.study});
  const d = {};
  const kd = readConst(html, 'KEY_DATES'), pw = readConst(html, 'PAY_WEEKS'), bw = readConst(html, 'BK_WEEKS');
  if(Array.isArray(kd)) d.keyDates = kd;
  if(Array.isArray(pw)) d.payWeeks = pw.map(pick);
  if(Array.isArray(bw)) d.bkWeeks = bw.map(pick);
  for(const [k, n] of [['bkClass', 'BK_CLASS'], ['payAssign', 'PAY_ASSIGN'], ['bkAssign', 'BK_ASSIGN']]){ const v = readConst(html, n); if(v && typeof v === 'object') d[k] = v; }
  for(const [k, n] of [['checklistPay', 'CHECKLIST_PAY'], ['checklistBk', 'CHECKLIST_BK']]){ const v = readConst(html, n); if(Array.isArray(v)) d[k] = v.length; }
  log('course data found:', Object.keys(d).join(', ') || 'none');
  return d;
}
const safeJSON = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16));

function pre(){
  const file = path.join(site, 'index.html');
  if(!fs.existsSync(file)) return log('no site/index.html — skipped');
  let html = read(file);
  if(html.includes(MARK)) return log('helper already in the page');
  const script = '<script>' + MARK + '\nwindow.SG_DATA = ' + safeJSON(courseData(html)) + ';\n(function(){\n' + notifCore(html) + '\n' + miniCore() + '\n' + read(path.join(src, 'app-helper.js')) + '\n})();\n</script>\n';
  const at = html.lastIndexOf('</body>');
  html = at >= 0 ? html.slice(0, at) + script + html.slice(at) : html + script;
  fs.writeFileSync(file, html);
  log('helper added to the page (on the build computer only)');
}

function copyDir(from, to){ fs.mkdirSync(to, {recursive: true}); for(const f of fs.readdirSync(from)){ const a = path.join(from, f), b = path.join(to, f); if(fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } }
function post(){
  if(!fs.existsSync(dist)) return log('no dist folder — skipped');
  // icons the site already has
  const iconDir = path.join(dist, 'icons');
  const icons = fs.existsSync(iconDir) ? fs.readdirSync(iconDir).filter(f => /\.png$/i.test(f)) : [];
  const ic = size => { const f = icons.find(x => x.includes(String(size)) && !/mask/i.test(x)) || icons[0]; return f ? 'icons/' + f : ''; };
  const icon192 = ic(192), icon512 = ic(512);
  // mini.html
  const sitePage = fs.existsSync(path.join(site, 'index.html')) ? read(path.join(site, 'index.html')) : '';
  let mini = read(path.join(src, 'mini.html'))
    .replace('/*NOTIFCORE*/', () => notifCore(sitePage))
    .replace('/*MINICORE*/', () => miniCore())
    .replace('/*ICON*/', icon192);
  fs.writeFileSync(path.join(dist, 'mini.html'), mini);
  // Widgets board files
  copyDir(path.join(src, 'cards'), path.join(dist, 'widgets', 'cards'));
  if(fs.existsSync(path.join(src, 'shots'))) copyDir(path.join(src, 'shots'), path.join(dist, 'widgets', 'shots'));
  fs.copyFileSync(path.join(src, 'data.json'), path.join(dist, 'widgets', 'data.json'));
  const iconList = [icon192 && {src: icon192, sizes: '192x192', type: 'image/png'}, icon512 && {src: icon512, sizes: '512x512', type: 'image/png'}].filter(Boolean);
  const W = (tag, name, description, card, shot) => ({name, short_name: name, description, tag, template: tag, ms_ac_template: 'widgets/cards/' + card, data: 'widgets/data.json', type: 'application/json',
    screenshots: [{src: 'widgets/shots/' + shot, sizes: '600x400', label: name + ' widget'}], icons: iconList.slice(0, 1), auth: false, update: 900, multiple: true});
  const manifest = {
    name: 'Study Guide Widgets', short_name: 'SG Widgets', id: './mini.html?app=widgets', start_url: './mini.html?w=shelf', scope: './', display: 'standalone',
    background_color: '#f6cbe2', theme_color: '#e8479a', icons: iconList,
    widgets: [
      W('sg-next', 'Next up', 'Your next reminders, deadlines and homework', 'next.json', 'next.png'),
      W('sg-week', 'This week', 'This week’s Payroll and Bookkeeping classes', 'week.json', 'week.png'),
      W('sg-list', 'My list', 'Your own to-do list — tap to tick', 'list.json', 'list.png'),
      W('sg-count', 'Exam countdown', 'Days until exams and your progress', 'count.json', 'count.png')]};
  fs.writeFileSync(path.join(dist, 'mini.webmanifest'), JSON.stringify(manifest, null, 1));
  // service worker
  const swFile = path.join(dist, 'sw.js');
  const add = read(path.join(src, 'sw-widgets.js'));
  if(fs.existsSync(swFile)){ const sw = read(swFile); if(!sw.includes('Study Guide widgets for the Windows Widgets board')) fs.writeFileSync(swFile, sw + '\n' + add); }
  else { fs.writeFileSync(swFile, "self.addEventListener('install', () => self.skipWaiting());\nself.addEventListener('activate', e => e.waitUntil(self.clients.claim()));\n" + add); log('no sw.js found — made a small one'); }
  log('mini windows and Widgets board files added');
}

try { mode === 'pre' ? pre() : post(); }
catch(e){ console.warn('[widgets] skipped because of an error (your site still builds):', e && e.stack || e); }
