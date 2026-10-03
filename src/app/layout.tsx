import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
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
    { media: "(prefers-color-scheme: light)", color: "#1f5fd6" },
    { media: "(prefers-color-scheme: dark)", color: "#1f5fd6" },
  ],
};

// Runs before first paint so the page never flashes the wrong theme.
const themeScript = `(function(){try{var p=localStorage.getItem('dockin-theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';var z=parseFloat(localStorage.getItem('dockin-text-scale'));if(z>0.5&&z<2&&z!==1)document.documentElement.style.zoom=z;}catch(e){}})();`;

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
var CHUNK=/ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported/i;
function heal(){
  // Once per ten minutes, and never twice in a row. A page whose scripts are
  // genuinely gone would otherwise reload itself forever, which is far worse
  // than the dead screen this is here to prevent.
  try{
    var last=Number(localStorage.getItem('dockin-healed')||0);
    if(Date.now()-last<600000)return;
    localStorage.setItem('dockin-healed',String(Date.now()));
  }catch(e){ return; }
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
  if(t&&t.tagName==='SCRIPT'&&t.src){ heal(); return; }
  if(e.message&&CHUNK.test(e.message)) heal();
},true);
window.addEventListener('unhandledrejection',function(e){
  var r=e.reason; if(!r)return;
  var m=(r.name||'')+' '+(r.message||r);
  if(CHUNK.test(m)) heal();
});

})();`.replace(/\s*\n\s*/g, " ");

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
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
