
/* ===== Study Guide widgets for the Windows Widgets board (added by widgets-build.mjs) ===== */
(function(){
  var WCACHE = 'sg-widgets';
  var CARDS = {'sg-next': 'widgets/cards/next.json', 'sg-week': 'widgets/cards/week.json', 'sg-list': 'widgets/cards/list.json', 'sg-count': 'widgets/cards/count.json'};
  function u(p){ return new URL(p, self.registration.scope).href; }
  async function getData(){
    var c = await caches.open(WCACHE), r = await c.match(u('widgets/data.json'));
    if(r) return r.json();
    try { return await (await fetch(u('widgets/data.json'))).json(); } catch(e){ return {}; }
  }
  async function putData(d){ var c = await caches.open(WCACHE); await c.put(u('widgets/data.json'), new Response(JSON.stringify(d), {headers: {'Content-Type': 'application/json'}})); }
  async function queue(a){
    var c = await caches.open(WCACHE), r = await c.match(u('widgets/queue.json')), q = r ? await r.json() : [];
    q.push(a); await c.put(u('widgets/queue.json'), new Response(JSON.stringify(q.slice(-50)), {headers: {'Content-Type': 'application/json'}}));
    var cl = await self.clients.matchAll({includeUncontrolled: true});
    cl.forEach(function(x){ x.postMessage({type: 'sg-widget-action', action: a}); });
  }
  async function renderTag(tag, data){
    if(!self.widgets) return;
    try {
      var w = await self.widgets.getByTag(tag); if(!w) return;
      var path = (w.definition && w.definition.msAcTemplate) || CARDS[tag];
      var tpl = await (await fetch(u(path))).text();
      await self.widgets.updateByTag(tag, {template: tpl, data: JSON.stringify(data)});
    } catch(e){}
  }
  async function renderAll(){ var d = await getData(); await Promise.all(Object.keys(CARDS).map(function(t){ return renderTag(t, d); })); }
  self.addEventListener('widgetinstall', function(e){ e.waitUntil(renderAll()); });
  self.addEventListener('widgetresume', function(e){ e.waitUntil(renderAll()); });
  self.addEventListener('activate', function(e){ e.waitUntil(renderAll()); });
  self.addEventListener('periodicsync', function(e){ if(e.tag === 'sg-widgets') e.waitUntil(renderAll()); });
  self.addEventListener('message', function(e){ if(e.data && e.data.type === 'sg-widgets-refresh') e.waitUntil(renderAll()); });
  self.addEventListener('widgetclick', function(e){
    var parts = String(e.action || '').split('|'), verb = parts[0], arg = parts.slice(1).join('|');
    if(verb === 'open'){ e.waitUntil(self.clients.openWindow(u('./' + (arg ? '#open=' + arg : '')))); return; }
    if(verb === 'mini'){ e.waitUntil(self.clients.openWindow(u('mini.html?w=shelf'))); return; }
    if(verb === 'tick' || verb === 'done') e.waitUntil((async function(){
      var d = await getData();
      if(verb === 'tick'){
        var it = (d.list || []).filter(function(x){ return x.id === arg; })[0]; if(!it) return;
        it.done = !it.done; it.box = it.done ? '☑' : '☐'; d.list3 = (d.list || []).slice(0, 3);
        await putData(d); await queue({a: 'set', id: arg, done: it.done});
      } else {
        d.next = (d.next || []).filter(function(x){ return x.key !== arg; }); d.next1 = d.next.slice(0, 1); d.next3 = d.next.slice(0, 3); d.has = d.next.length > 0;
        await putData(d); await queue({a: 'done', key: arg});
      }
      await renderAll();
    })());
  });
})();
