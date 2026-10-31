// Study Guide widgets: helper added to the main page by widgets-build.mjs
(function(){
  'use strict';
  try { localStorage.setItem('sg_data_v1', JSON.stringify(window.SG_DATA || {})); } catch(e){}
  function when(test, fn, tries){ tries = tries == null ? 120 : tries; try { if(test()) return fn(); } catch(e){} if(tries > 0) setTimeout(function(){ when(test, fn, tries - 1); }, 150); }
  // open a week (#open=pay5) or an editor (#edit=key) when a mini window or widget asks
  function handle(hash){
    var m = /(?:^|[#&])open=([a-z]+\d+)/.exec(hash || ''), e = /(?:^|[#&])edit=([^&]+)/.exec(hash || '');
    if(m) when(function(){ return window.SGNotif && SGNotif.openWeek; }, function(){ SGNotif.openWeek(m[1]); });
    else if(e) when(function(){ return window.SGNotif && SGNotif.open; }, function(){ SGNotif.open(decodeURIComponent(e[1])); });
    if((m || e) && /[#&](open|edit)=/.test(location.hash)) try { history.replaceState(null, '', location.pathname + location.search); } catch(err){}
  }
  handle(location.hash);
  window.addEventListener('hashchange', function(){ handle(location.hash); });
  if('BroadcastChannel' in window){
    var ch = new BroadcastChannel('sg-app');
    ch.onmessage = function(ev){ var d = ev.data || {}; if(d.type === 'open' && !document.hidden){ ch.postMessage({type: 'ack'}); handle('#' + d.hash); try { window.focus(); } catch(e){} } };
  }
  // taps made on the Windows Widgets board, then keep the board up to date
  function apply(a){
    try {
      if(a.a === 'set' && window.SGCustom && SGCustom.update) SGCustom.update(a.id, {done: !!a.done});
      else if(a.a === 'done'){
        if(/^hw_/.test(a.key) && window.SG && SG.hwUpdate) SG.hwUpdate(a.key.slice(3), {done: true});
        else if(/^c_/.test(a.key) && window.SGCustom && SGCustom.update) SGCustom.update(a.key.slice(2), {done: true});
      }
    } catch(e){ console.warn('widget action', e); }
  }
  function feed(){
    try {
      if(!window.SG || !SG.getState) return;
      var custom = window.SGCustom && SGCustom.all ? SGCustom.all() : [];
      MiniCore.feed(MiniCore.model({state: SG.getState() || {}, homework: SG.getHomework ? SG.getHomework() || {} : {}, custom: custom || []}));
    } catch(e){}
  }
  when(function(){ return window.SG && SG.getState; }, function(){
    setTimeout(function(){ MiniCore.takeQueue().then(function(q){ q.forEach(apply); setTimeout(feed, 1500); }); }, 2500);
    setInterval(feed, 60 * 1000);
    document.addEventListener('visibilitychange', function(){ if(document.hidden) feed(); });
  });
  if(navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', function(e){ if(e.data && e.data.type === 'sg-widget-action'){ apply(e.data.action); setTimeout(feed, 1500); } });
})();
