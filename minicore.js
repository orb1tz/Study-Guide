/*MINICORE-START*/
// Shared by the mini windows, the Widgets board feed and the app helper. Uses NotifCore + window.SG_DATA (added by build.mjs).
var MiniCore = (function(){
  'use strict';
  var D = function(){ return window.SG_DATA || {}; };
  function todayISO(){ return new Date().toLocaleDateString('en-CA'); }
  function addDays(iso, n){ var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function weeks(s){ return (s === 'pay' ? D().payWeeks : D().bkWeeks) || []; }
  function topic(s, n){ return weeks(s).filter(function(w){ return w.n === n; })[0]; }
  function chosen(state, s, slot){
    var v = state['los_' + s + slot];
    if(Array.isArray(v)) return v.filter(function(n, i){ return typeof n === 'number' && topic(s, n) && v.indexOf(n) === i; }).sort(function(a, b){ return a - b; });
    return [slot];
  }
  function hwFlat(homework){
    var out = [];
    Object.keys(homework || {}).forEach(function(wk){ (homework[wk] || []).forEach(function(h){ out.push({id: h.id, week: wk, text: h.text, due: h.due || '', done: !!h.done, created: h.created || 0}); }); });
    return out;
  }
  function currentWeek(s, today){
    var W = weeks(s); if(!W.length) return null;
    var cur = W.filter(function(w){ return today >= w.date && today <= addDays(w.date, 6); })[0];
    if(cur) return {w: cur, now: true};
    var next = W.filter(function(w){ return w.date > today; })[0];
    return next ? {w: next, now: false} : {w: W[W.length - 1], now: false, over: true};
  }
  function assignIds(map, s){
    var ids = [];
    Object.keys(map || {}).forEach(function(n){ (map[n] || []).forEach(function(e){ if(e[1] === 'due') ids.push(s + n + '_' + e[0] + 'sub'); }); });
    return ids;
  }
  function progress(state, homework){
    var d = D(); if(!d.payWeeks || !d.bkWeeks) return null;
    var ids = [], seen = {};
    ['pay', 'bk'].forEach(function(s){
      weeks(s).forEach(function(w){
        ids.push(s + w.n + '_attended');
        chosen(state, s, w.n).forEach(function(t){ if(!seen[s + t]){ seen[s + t] = 1; ids.push(s + t + '_study'); } });
      });
    });
    ids = ids.concat(assignIds(d.payAssign, 'pay'), assignIds(d.bkAssign, 'bk'));
    for(var i = 0; i < (d.checklistPay || 0); i++) ids.push('clpay_' + i);
    for(var j = 0; j < (d.checklistBk || 0); j++) ids.push('clbk_' + j);
    var hw = hwFlat(homework);
    var total = ids.length + hw.length;
    var done = ids.filter(function(id){ return !!state[id]; }).length + hw.filter(function(h){ return h.done; }).length;
    return {done: done, total: total, pct: total ? Math.round(done / total * 100) : 0};
  }
  // everything the mini windows and widgets show
  function model(src){
    var state = src.state || {}, homework = src.homework || {}, custom = src.custom || [], today = src.today || todayISO();
    var all = NotifCore.all({keyDates: D().keyDates || [], homework: hwFlat(homework), custom: custom, state: state});
    var next = all.filter(function(i){ return NotifCore.inList(i, today); })
      .map(function(i){ var x = {}; for(var k in i) x[k] = i[k]; x.n = NotifCore.daysBetween(today, i.date); return x; })
      .sort(function(a, b){ return a.n - b.n; });
    var wk = {};
    ['pay', 'bk'].forEach(function(s){
      var c = currentWeek(s, today); if(!c) return;
      var w = c.w;
      wk[s] = {strand: s, n: w.n, date: w.date, now: c.now, over: !!c.over, key: s + w.n,
        cls: s === 'bk' && D().bkClass ? (D().bkClass[w.n] || '') : '',
        topics: chosen(state, s, w.n).map(function(t){ var T = topic(s, t); return {n: t, lo: T.lo, title: T.title, study: T.study, key: s + t + '_study', done: !!state[s + t + '_study']}; }),
        attendedKey: s + w.n + '_attended', attended: !!state[s + w.n + '_attended'],
        homework: (homework[s + w.n] || []).map(function(h){ return {id: h.id, week: s + w.n, text: h.text, due: h.due || '', done: !!h.done}; })};
    });
    var list = custom.filter(function(c){ return c.kind !== 'notif' && c.kind !== 'override'; })
      .map(function(c){ return {id: c.id, text: c.text, done: !!c.done, created: c.created || 0}; })
      .sort(function(a, b){ return (a.done - b.done) || (a.created - b.created); });
    return {today: today, next: next, all: all, week: wk, list: list, progress: progress(state, homework)};
  }
  function examDate(){
    var e = (D().keyDates || []).filter(function(k){ return /exam/i.test(k.t || '') && !/prep/i.test(k.t || ''); }).map(function(k){ return k.date; }).sort().pop();
    return e || D().examDate || '2027-01-09';
  }
  // which week an item belongs to (same rule as the app)
  function weekFor(it){
    if(it.kind === 'hw' || it.kind === 'mine') return it.week || null;
    var W = weeks(it.s); if(!W.length || !it.date) return null;
    var w = W.filter(function(x){ return it.date >= x.date && it.date < addDays(x.date, 7); })[0];
    if(!w) w = W.filter(function(x){ return x.date > it.date; })[0] || W[W.length - 1];
    return w ? it.s + w.n : null;
  }

  // ---------- Widgets board feed (stored on this device only) ----------
  var CACHE = 'sg-widgets', last = '';
  function dataURL(name){ return new URL('widgets/' + name, location.href).href; }
  function shortWhen(n){ return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 0 ? 'Overdue' : n < 7 ? 'In ' + n + ' days' : n === 7 ? 'In a week' : 'In ' + n + ' days'; }
  function feed(m){
    if(!('caches' in window)) return;
    var fmt = function(d){ return new Date(d + 'T12:00').toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'}); };
    var exam = examDate();
    var nx = m.next.slice(0, 6).map(function(i){ return {key: i.key, t: i.t, ico: i.ico, when: shortWhen(i.n), day: fmt(i.date), week: weekFor(i) || '', canDone: i.kind === 'mine' || i.kind === 'hw'}; });
    var ls = m.list.filter(function(x){ return !x.done; }).concat(m.list.filter(function(x){ return x.done; })).slice(0, 6).map(function(x){ return {id: x.id, text: x.text, done: x.done, box: x.done ? '☑' : '☐'}; });
    var data = {updated: new Date().toISOString(),
      next: nx, next1: nx.slice(0, 1), next3: nx.slice(0, 3), has: nx.length > 0,
      week: ['pay', 'bk'].filter(function(s){ return m.week[s]; }).map(function(s){ var w = m.week[s]; return {strand: s, ico: s === 'pay' ? '📙' : '📗', label: (s === 'pay' ? 'Payroll' : 'Bookkeeping') + ' W' + w.n, day: fmt(w.date), title: w.topics.map(function(t){ return t.title; }).join(' + ') || 'No learning outcome ticked', key: w.key}; }),
      list: ls, list3: ls.slice(0, 3), hasList: ls.length > 0,
      exam: {days: Math.max(0, NotifCore.daysBetween(m.today, exam)), day: fmt(exam)},
      progress: m.progress || {done: 0, total: 0, pct: 0}};
    var body = JSON.stringify(data);
    if(body.replace(/"updated":"[^"]*"/, '') === last) return;
    last = body.replace(/"updated":"[^"]*"/, '');
    caches.open(CACHE).then(function(c){ return c.put(dataURL('data.json'), new Response(body, {headers: {'Content-Type': 'application/json'}})); })
      .then(function(){ if(navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({type: 'sg-widgets-refresh'}); })
      .catch(function(){});
  }
  // actions tapped on the Widgets board while the app was closed
  function takeQueue(){
    if(!('caches' in window)) return Promise.resolve([]);
    return caches.open(CACHE).then(function(c){
      return c.match(dataURL('queue.json')).then(function(r){ if(!r) return []; return r.json().then(function(q){ return c.delete(dataURL('queue.json')).then(function(){ return Array.isArray(q) ? q : []; }); }); });
    }).catch(function(){ return []; });
  }
  return {examDate: examDate, todayISO: todayISO, addDays: addDays, weeks: weeks, topic: topic, chosen: chosen, hwFlat: hwFlat, model: model, weekFor: weekFor, feed: feed, takeQueue: takeQueue, shortWhen: shortWhen};
})();
/*MINICORE-END*/
