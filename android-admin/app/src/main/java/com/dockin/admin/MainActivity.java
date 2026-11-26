package com.dockin.admin;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * DockIn Admin: the founder's dashboard (dock-in.vercel.app/admin) in its own
 * app. Everything is on the website — this is a full-screen browser for that
 * one page that keeps you signed in, sends other links to the real browser, and
 * shows a retry page instead of Android's "Web page not available".
 */
public class MainActivity extends Activity {

    static final String HOST = "dock-in.vercel.app";
    static final String HOME = "https://" + HOST + "/admin";
    private WebView web;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#5C2A10"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#F6ECDC"));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        // Android 15+ draws apps edge to edge: keep the page clear of the status and navigation bars.
        root.setOnApplyWindowInsetsListener((View v, WindowInsets insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(s.getUserAgentString() + " DockInAdmin/1");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (u != null && HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                    // Nothing can open it: stay put.
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request == null || !request.isForMainFrame()) return;
                view.loadDataWithBaseURL("https://" + HOST + "/", OFFLINE, "text/html", "utf-8", null);
            }
        });

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(HOME);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private static final String OFFLINE = "<!doctype html><html><head><meta name=viewport content='width=device-width,initial-scale=1'>"
            + "<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f6ecdc;"
            + "font-family:system-ui,sans-serif;color:#3a2314;text-align:center}div{padding:32px}h1{font-size:21px;margin:0 0 8px}"
            + "p{color:#86684d;margin:0 0 22px}button{background:#8f4a22;color:#fff4e3;border:0;border-radius:14px;padding:13px 26px;"
            + "font-size:15px;font-weight:700}</style></head><body><div><h1>Can't reach DockIn</h1>"
            + "<p>Check the internet and try again.</p><button onclick=\"location.href='" + HOME + "'\">Try again</button>"
            + "</div><script>setTimeout(function(){location.href='" + HOME + "'},8000)</script></body></html>";
}
