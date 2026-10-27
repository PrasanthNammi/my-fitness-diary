document.getElementById('mfd-engine').src='/legacy/index.html'+location.search;
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{}));
