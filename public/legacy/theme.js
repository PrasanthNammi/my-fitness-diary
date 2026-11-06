// Appearance: 'light' | 'dark' | 'system' (default), saved on this device. Loaded in <head> of the
// app and of the account/data frame, before styles paint, so there is no flash of the wrong theme.
// Sets <html data-theme="light|dark"> (what the CSS uses) and data-appearance (the saved choice).
(function(){
 var KEY='mfd-appearance',root=document.documentElement,query=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
 function choice(){try{var v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:'system'}catch(e){return 'system'}}
 function apply(){
  var c=choice(),dark=c==='dark'||(c==='system'&&!!query&&query.matches);
  root.setAttribute('data-theme',dark?'dark':'light');root.setAttribute('data-appearance',c);
  var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',dark?'#0b0b0c':'#f6f5f2');
 }
 apply();
 if(query){if(query.addEventListener)query.addEventListener('change',apply);else if(query.addListener)query.addListener(apply)}
 // Another window or the frame changed it: follow.
 window.addEventListener('storage',function(e){if(e.key===KEY)apply()});
 window.mfdAppearance={
  get:choice,
  set:function(v){if(v!=='light'&&v!=='dark'&&v!=='system')return;try{if(v==='system')localStorage.removeItem(KEY);else localStorage.setItem(KEY,v)}catch(e){}apply();
   try{window.dispatchEvent(new Event('mfd-appearance'))}catch(e){}}
 };
})();
