package com.dockin.student;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/**
 * The app: DockIn's site in a WebView, with the phone's own powers wired in
 * through {@link DockInPlugin}.
 */
public class MainActivity extends BridgeActivity {

    /** Which screen to open, set by DockIn's own notifications. */
    static final String EXTRA_OPEN = "com.dockin.student.OPEN";

    /**
     * The launch splash (the cap docking onto the cover) is held on screen until
     * the web app has drawn its first real screen, so the opening reads as one
     * motion — splash straight into Today, with no blank brown gap while the site
     * loads. The web calls DockIn.appReady() the moment it is ready.
     */
    private boolean contentReady = false;

    /** Called from the web (via DockInPlugin) when the first screen is up. */
    void markContentReady() {
        runOnUiThread(() -> contentReady = true);
    }

    /** The page shown when a screen can't load; it retries every few seconds. */
    static String retryPage(String url) {
        String safe = url.replace("\\", "").replace("\"", "").replace("'", "").replace("<", "");
        return "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"
                + "<style>html,body{margin:0;height:100%;background:#f6ecd9;color:#3b2414;font:16px/1.4 system-ui,Roboto,sans-serif}"
                + "main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;box-sizing:border-box}"
                + ".cap{width:84px;height:84px;border-radius:24px;background:linear-gradient(160deg,#c06a2b,#864220);display:grid;place-items:center;font-size:40px}"
                + "h1{font-size:22px;margin:22px 0 6px}p{margin:0;color:#7a5a43;font-size:14.5px;max-width:280px}"
                + "button{margin-top:26px;height:48px;padding:0 28px;border:0;border-radius:16px;background:#864220;color:#fff;font-weight:700;font-size:15px}</style></head>"
                + "<body><main><div class='cap'>\uD83C\uDF93</div><h1>Can't reach DockIn</h1><p>Check your internet. This opens by itself when you're back online.</p>"
                + "<button onclick=\"location.replace('" + safe + "')\">Try again</button></main>"
                + "<script>function t(){fetch('/',{cache:'no-store'}).then(function(r){if(r.ok)location.replace('" + safe + "')}).catch(function(){})}"
                + "addEventListener('online',t);setInterval(t,4000)</script></body></html>";
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugins written inside the app are not found automatically; they are
        // registered before the bridge is built.
        registerPlugin(DockInPlugin.class);

        // Hold the system splash until the web signals it has painted — but never
        // forever: a slow network still gives up and shows the app after a few
        // seconds rather than staring at the cap.
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !contentReady);
        new Handler(Looper.getMainLooper()).postDelayed(this::markContentReady, 6000);

        super.onCreate(savedInstanceState);

        // Answer the app's own screens and scripts from the copy inside the APK
        // (see Bundled) — the first open never waits on the network again.
        final android.content.Context app = getApplicationContext();
        if (bridge != null) {
            bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    WebResourceResponse r = Bundled.intercept(app, request, true);
                    return r != null ? r : super.shouldInterceptRequest(view, request);
                }

                /**
                 * A screen that fails to load shows DockIn's own "reconnecting"
                 * page — never Android's grey "Web page not available" — and
                 * goes back to the same screen by itself once the network is up.
                 */
                @Override
                public void onReceivedError(WebView view, WebResourceRequest request, android.webkit.WebResourceError error) {
                    if (request != null && request.isForMainFrame() && request.getUrl() != null
                            && "dock-in.vercel.app".equals(request.getUrl().getHost())) {
                        view.loadDataWithBaseURL("https://dock-in.vercel.app/", retryPage(request.getUrl().toString()), "text/html", "utf-8", null);
                        return;
                    }
                    super.onReceivedError(view, request, error);
                }
            });
        }
        try {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                    return Bundled.intercept(app, request, false);
                }
            });
        } catch (Exception ignored) {
            // Very old WebView without service-worker hooks: pages still use the bundle.
        }

        // Back goes back a screen, the way it does in every other app. Without
        // this Android would close DockIn from wherever you were.
        getOnBackPressedDispatcher().addCallback(new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = bridge == null ? null : bridge.getWebView();
                if (web != null && web.canGoBack()) {
                    web.goBack();
                    return;
                }
                // Out of screens: step aside like the home button does, so the
                // next open is instant instead of a cold start.
                moveTaskToBack(true);
            }
        });
    }
}
