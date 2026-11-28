import type { Metadata, Viewport } from "next";
// Self-hosted so the build needs no network and the app keeps its type offline.
// One modern geometric family for text and headings, matching the brand.
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "DockIn",
  description: "Attendance, money, assignments and exams in one place.",
  applicationName: "DockIn",
  appleWebApp: { capable: true, title: "DockIn", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2e4cb" },
    { media: "(prefers-color-scheme: dark)", color: "#1c140e" },
  ],
};

// Runs before first paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{if(window.androidBridge||(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()))document.documentElement.classList.add('in-app');}catch(e){}try{document.documentElement.setAttribute('data-boot','');}catch(e){}try{var n=navigator,m=n.deviceMemory,c=n.hardwareConcurrency;if(m&&m>=6)localStorage.removeItem('dockin-lite');if(localStorage.getItem('dockin-lite')==='1'||(m&&m<=3)||(c&&c<=4))document.documentElement.classList.add('lite');}catch(e){}try{var p=localStorage.getItem('dockin-theme')||'light';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var ua=navigator.userAgent||'';var ios=/iP(hone|ad|od)/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1);var z=parseFloat(localStorage.getItem('dockin-text-scale'));if(!(z>=0.7&&z<=0.95))z=0.9;document.documentElement.style.zoom=ios?'':String(z);}catch(e){}})();`;

/**
 * If a script fails to load, fix it instead of showing a dead app.
 *
 * A page kept by the service worker can outlive the scripts it names — one
 * flaky moment during a deploy is enough. What the person sees then is the app
 * drawn out in full with nothing responding to a tap, and no way to guess that
 * a reload would help. This notices the failed script, clears the worker and
 * its caches, and reloads once; `sessionStorage` makes sure "once" means once,
 * so a genuinely missing file can never become a loop.
 */
const healScript = `(function(){
var CHUNK=/ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to load chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported/i;
// A script that failed because the network is down or crawling is not a broken
// install: wiping the saved copy then would leave nothing to open offline. So
// heal only once DockIn's own server answers quickly (the line is fine, the
// file really is missing).
function heal(){
  if(navigator.onLine===false)return;
  try{
    var ctl=window.AbortController?new AbortController():null;
    var t=setTimeout(function(){ if(ctl)ctl.abort(); },4000);
    fetch('/api/ping?t='+Date.now(),{cache:'no-store',signal:ctl?ctl.signal:undefined})
      .then(function(r){ clearTimeout(t); if(r&&r.ok)doHeal(); })
      .catch(function(){ clearTimeout(t); });
  }catch(e){}
}
function doHeal(){
  // Once per ten minutes, and never twice in a row. A page whose scripts are
  // genuinely gone would otherwise reload itself forever, which is far worse
  // than the dead screen this is here to prevent.
  try{
    var last=Number(localStorage.getItem('dockin-healed')||0);
    if(Date.now()-last<600000)return;
    localStorage.setItem('dockin-healed',String(Date.now()));
  }catch(e){ return; }
  // In the app, put the copy inside the APK back in charge of opening screens.
  try{var P=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.DockIn;if(P&&P.setLive)P.setLive({on:false});}catch(e){}
  var done=function(){ location.reload(); };
  try{
    if('serviceWorker'in navigator){
      navigator.serviceWorker.getRegistrations().then(function(rs){
        rs.forEach(function(r){ if(r.active)r.active.postMessage('dockin-reset'); r.unregister(); });
      }).catch(function(){});
    }
  }catch(e){}
  if(window.caches){
    caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k) })) })
      .catch(function(){}).then(done);
  } else { done(); }
}
window.addEventListener('error',function(e){
  var t=e.target;
  // Only this app's own code. A third-party script that fails, or an image,
  // is not a reason to throw away the cache and reload the page.
  if(t&&t.tagName==='SCRIPT'&&t.src&&t.src.indexOf('/_next/')>-1){ heal(); return; }
  if(e.message&&CHUNK.test(e.message)) heal();
},true);
// A script that never answers raises no error at all — the app just sits on
// its splash. If nothing has drawn after 12 seconds while online, heal too.
setTimeout(function(){
  if(!window.__dockinReady&&navigator.onLine!==false) heal();
},12000);
window.addEventListener('unhandledrejection',function(e){
  var r=e.reason; if(!r)return;
  var m=(r.name||'')+' '+(r.message||r);
  if(CHUNK.test(m)) heal();
});

})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: healScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
