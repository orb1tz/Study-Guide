// Made by build.mjs from site/index.html — edit it there, not here.

// Shared rules for the 🔔 list and the pop-up sender (the website build copies this into the sender).
var NotifCore = (function(){
  'use strict';
  var LEAD_CHOICES = [[0, 'on the day'], [1, 'the day before'], [2, '2 days before'], [3, '3 days before'], [7, 'a week before'], [14, '2 weeks before']];
  var DEFAULT_LEADS = [7, 1, 0];
  function daysBetween(fromISO, toISO){ return Math.round((Date.parse(toISO + 'T00:00:00Z') - Date.parse(fromISO + 'T00:00:00Z')) / 86400000); }
  function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60); }
  function overrideId(key){ return 'o_' + String(key).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120); }
  function isTime(t){ return typeof t === 'string' && /^\d{2}:\d{2}$/.test(t); }
  function isDate(d){ return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function cleanLeads(l){ return Array.isArray(l) ? l.filter(function(n, i){ return typeof n === 'number' && n >= 0 && n <= 60 && l.indexOf(n) === i; }).sort(function(a, b){ return b - a; }) : null; }
  function pick(o, k){ return o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined; }

  // everything that can appear in the list, before your edits
  function baseItems(o){
    var items = [], state = o.state || {};
    (o.keyDates || []).forEach(function(e){
      items.push({key: 'kd_' + e.date + '_' + slug(e.t), kind: 'kd', s: e.s, ico: e.ico, t: e.t, sub: e.sub, date: e.date,
        doneFlag: e.done || null, done: !!(e.done && state[e.done])});
    });
    (o.homework || []).forEach(function(h){
      var wk = String(h.week || ''), strand = wk.indexOf('pay') === 0 ? 'pay' : 'bk';
      items.push({key: 'hw_' + h.id, kind: 'hw', id: h.id, week: wk, s: strand, ico: '📝', t: 'Homework: ' + h.text, rawText: h.text,
        sub: (strand === 'pay' ? 'Payroll' : 'Bookkeeping') + ' W' + wk.replace(/\D/g, '') + ' · your own task', date: h.due || '', done: !!h.done});
    });
    (o.custom || []).forEach(function(c){
      if(c.kind !== 'notif') return;
      items.push({key: 'c_' + c.id, kind: 'mine', cid: c.id, week: c.week || '', s: 'mine', ico: '🔔', t: c.text, rawText: c.text, sub: 'Your notification', date: c.date || '',
        done: !!c.done, note: c.note || '', off: !!c.off, leads: cleanLeads(c.leads), time: isTime(c.time) ? c.time : '', repeat: c.repeat || 'none'});
    });
    return items;
  }
  // apply your edits to built-in items (stored as kind:'override' records)
  function withEdits(items, custom){
    var ov = {};
    (custom || []).forEach(function(c){ if(c.kind === 'override' && c.target) ov[c.target] = c; });
    return items.map(function(it){
      var e = ov[it.key]; if(!e || it.kind === 'mine') return it;
      var x = {}; for(var k in it) x[k] = it[k];
      x.edited = true; x.overrideId = e.id;
      if(typeof e.t === 'string' && e.t.trim()) x.t = e.t.trim();
      if(isDate(e.date) && e.date !== it.date){ x.date = e.date; x.moved = true; }
      if(typeof e.note === 'string') x.note = e.note;
      if(e.off === true) x.off = true;
      if(cleanLeads(e.leads)) x.leads = cleanLeads(e.leads);
      if(isTime(e.time)) x.time = e.time;
      if(e.repeat) x.repeat = e.repeat;
      if(e.done === true) x.done = true;
      if(e.hidden === true) x.hidden = true;
      return x;
    });
  }
  function all(o){ return withEdits(baseItems(o), o.custom); }

  // should it show in the 🔔 list?
  function inList(it, today){
    if(it.hidden || it.done || !it.date) return false;
    var n = daysBetween(today, it.date);
    if(it.repeat === 'untilDone') return true;
    if(it.kind === 'kd') return n >= 0 || (!!it.doneFlag && n >= -14);
    if(it.kind === 'hw') return n <= 14 && n >= -14;
    return n >= -3;
  }
  // should it pop up today, and when?
  function dueToday(it, today, settings){
    settings = settings || {};
    if(it.hidden || it.done || it.off || !it.date) return null;
    var leads = it.leads && it.leads.length ? it.leads : (cleanLeads(settings.leads) || DEFAULT_LEADS);
    if(!leads.length) return null;
    var n = daysBetween(today, it.date), max = Math.max.apply(null, leads), hit;
    if(it.repeat === 'daily') hit = n >= 0 && n <= max;
    else if(it.repeat === 'untilDone') hit = n <= max;
    else hit = leads.indexOf(n) >= 0;
    if(!hit) return null;
    return {n: n, time: it.time || (isTime(settings.time) ? settings.time : '08:00')};
  }
  function whenLabel(n){ return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === 7 ? 'In a week' : n < 0 ? (-n === 1 ? '1 day overdue' : (-n) + ' days overdue') : 'In ' + n + ' days'; }
  function leadsText(leads){
    var names = leads.map(function(n){ var c = LEAD_CHOICES.filter(function(x){ return x[0] === n; })[0]; return c ? c[1] : n + ' days before'; });
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1] : (names[0] || '');
  }
  // short description of a customised reminder, or '' if it uses your usual settings
  function describe(it){
    if(it.off) return '🔕 no pop-up';
    if(!(it.leads && it.leads.length) && !it.time && (!it.repeat || it.repeat === 'none')) return '';
    var parts = [];
    if(it.repeat === 'daily') parts.push('daily until then');
    else if(it.repeat === 'untilDone') parts.push('daily until done');
    if(it.leads && it.leads.length && it.repeat !== 'daily' && it.repeat !== 'untilDone') parts.push(leadsText(it.leads));
    else if(it.leads && it.leads.length) parts.push('from ' + leadsText([Math.max.apply(null, it.leads)]));
    if(it.time) parts.push('at ' + it.time);
    return '⏰ ' + parts.join(' · ');
  }
  // one pop-up for everything due at once
  function message(due, today){
    if(!due.length) return null;
    if(due.length === 1){
      var i = due[0];
      return {title: i.ico + ' ' + i.t, body: whenLabel(i.n) + ' · ' + (i.note ? i.note : i.sub), tag: 'sg-' + today + '-' + i.key.slice(0, 40), url: './'};
    }
    var body = due.slice(0, 6).map(function(i){ return whenLabel(i.n) + ': ' + i.t; }).join('\n') + (due.length > 6 ? '\n+' + (due.length - 6) + ' more' : '');
    return {title: '📚 ' + due.length + ' things coming up', body: body, tag: 'sg-' + today, url: './'};
  }
  return {LEAD_CHOICES: LEAD_CHOICES, DEFAULT_LEADS: DEFAULT_LEADS, daysBetween: daysBetween, overrideId: overrideId, cleanLeads: cleanLeads,
    baseItems: baseItems, withEdits: withEdits, all: all, inList: inList, dueToday: dueToday, whenLabel: whenLabel, leadsText: leadsText, describe: describe, message: message};
})();

export default NotifCore;
export { NotifCore };
