package com.dockin.student;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Camu's own sign-in page, inside DockIn.
 *
 * Sachin signs in exactly as he does on the website — "Sign in with Microsoft",
 * his own password typed into Microsoft's own page. DockIn never sees that
 * password. Once Camu has let him in, this keeps two things: the session Camu
 * set (a cookie) and the ids Camu uses for his course and semester. Then it
 * checks the session actually reads attendance, and closes.
 *
 * Microsoft's sign-in opens as a pop-up, so pop-up windows are given a WebView
 * of their own on top, and removed when Microsoft closes them.
 *
 * Silent renewal. Camu ends the session every so often; signing in again is the
 * same Microsoft flow, and Microsoft remembers this phone once he has ticked
 * "Stay signed in" the first time, so it usually completes with nothing typed.
 * {@link #EXTRA_SILENT} covers the page with a "Reconnecting…" screen and lets
 * that happen out of sight. Only if it is still not in after a few seconds —
 * Microsoft wants him to pick his account or approve — does the page show, so
 * he taps once. No password is ever stored or filled in; this only rides the
 * sign-in Microsoft is already holding.
 */
public class CamuLoginActivity extends Activity {

    /** Renew quietly: keep the page hidden behind "Reconnecting…", reveal only if a tap is needed. */
    static final String EXTRA_SILENT = "silent";
    /** How long to let the remembered sign-in finish before showing the page. */
    private static final long REVEAL_AFTER_MS = 12_000;

    /** Reads the student's ids out of Camu's own saved state, or "" before sign-in. */
    private static final String READ_IDS =
            "(function(){try{var r=localStorage.getItem('persist:root');if(!r)return '';"
                    + "var c=JSON.parse(JSON.parse(r).common||'{}');var p=c.Progression;"
                    + "if(!p||!p.StuID||!p.CmProgID&&!p._id)return '';"
                    + "var n=(c.loginDetails&&c.loginDetails.Name)||'';"
                    + "return JSON.stringify({InId:p.InId,PrID:p.PrID,CrID:p.CrID,DeptID:p.DeptID,SemID:p.SemID,"
                    + "AcYr:p.AcYr,CmProgID:p._id||p.CmProgID,StuID:p.StuID,isFE:!!p.isFE,name:n,sem:p.SemName||''});"
                    + "}catch(e){return ''}})()";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<WebView> popups = new ArrayList<>();
    private FrameLayout root;
    private WebView web;
    private TextView note;
    private View cover;
    private boolean silent = false;
    private boolean revealed = false;
    private boolean done = false;
    private boolean checking = false;

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            check();
            if (!done) handler.postDelayed(this, 1500);
        }
    };

    /** The remembered sign-in did not finish on its own; let him see the page and tap. */
    private final Runnable reveal = new Runnable() {
        @Override
        public void run() {
            if (done || revealed) return;
            revealed = true;
            if (cover != null) {
                cover.setVisibility(View.GONE);
                root.removeView(cover);
                cover = null;
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        silent = getIntent() != null && getIntent().getBooleanExtra(EXTRA_SILENT, false);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(0xFF1F5FD6);
        int pad = dp(14);
        bar.setPadding(pad, dp(10), dp(6), dp(10));

        LinearLayout words = new LinearLayout(this);
        words.setOrientation(LinearLayout.VERTICAL);
        TextView title = new TextView(this);
        title.setText("Connect Camu");
        title.setTextColor(Color.WHITE);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        note = new TextView(this);
        note.setText("Sign in with Microsoft, like always. DockIn only reads attendance.");
        note.setTextColor(0xE6FFFFFF);
        note.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12.5f);
        words.addView(title);
        words.addView(note);
        bar.addView(words, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView close = new TextView(this);
        close.setText("Cancel");
        close.setTextColor(Color.WHITE);
        close.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        close.setPadding(dp(12), dp(10), dp(12), dp(10));
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        bar.addView(close);

        web = new WebView(this);
        setUp(web);
        column.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        column.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(column, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // Android 15 draws apps under the status bar; keep the bar below it.
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                v.setPadding(0, insets.getSystemWindowInsetTop(), 0, insets.getSystemWindowInsetBottom());
                return insets;
            }
        });

        // Renewing: hide the whole thing behind a calm "Reconnecting…" screen, and
        // only reveal the page if the remembered sign-in has not finished in time.
        if (silent) {
            title.setText("Reconnecting to Camu");
            note.setText("Just a moment — keeping your attendance up to date.");
            cover = reconnectingScreen();
            root.addView(cover, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            handler.postDelayed(reveal, REVEAL_AFTER_MS);
        }

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);
        web.loadUrl(Camu.BASE + "/");
        handler.postDelayed(poll, 2000);
    }

    /** A full-screen brand panel shown over the WebView while the sign-in renews itself. */
    private View reconnectingScreen() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(0xFF1F5FD6);
        panel.setClickable(true);

        TextView mark = new TextView(this);
        mark.setText("DockIn");
        mark.setTextColor(Color.WHITE);
        mark.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        mark.setTypeface(Typeface.DEFAULT_BOLD);
        mark.setGravity(Gravity.CENTER);

        TextView line = new TextView(this);
        line.setText("Reconnecting to Camu…");
        line.setTextColor(0xE6FFFFFF);
        line.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        line.setGravity(Gravity.CENTER);
        line.setPadding(0, dp(8), 0, 0);

        panel.addView(mark);
        panel.addView(line);
        return panel;
    }

    private void setUp(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // Look like the phone's Chrome; some sign-in pages treat an app's WebView differently.
        String ua = s.getUserAgentString();
        if (ua != null) s.setUserAgentString(ua.replace("; wv)", ")"));
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true);
        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (view == web) check();
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                WebView child = new WebView(CamuLoginActivity.this);
                setUp(child);
                root.addView(child, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                popups.add(child);
                // While renewing, keep Microsoft's pop-up behind the "Reconnecting…" cover
                // too, so nothing flickers unless we decide to show the page.
                if (cover != null && !revealed) cover.bringToFront();
                WebView.WebViewTransport transport = (WebView.WebViewTransport) resultMsg.obj;
                transport.setWebView(child);
                resultMsg.sendToTarget();
                return true;
            }

            @Override
            public void onCloseWindow(WebView window) {
                closePopup(window);
            }
        });
    }

    private void closePopup(WebView w) {
        popups.remove(w);
        root.removeView(w);
        w.destroy();
    }

    /** Signed in yet? Camu writes the student's ids to its saved state once it has let them in. */
    private void check() {
        if (done || checking || web == null) return;
        web.evaluateJavascript(READ_IDS, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                JSONObject ids = parse(value);
                if (ids == null || done || checking) return;
                String cookie = CookieManager.getInstance().getCookie(Camu.BASE);
                if (cookie == null || cookie.isEmpty()) return;
                verify(cookie, ids, web.getSettings().getUserAgentString());
            }
        });
    }

    private static JSONObject parse(String value) {
        if (value == null || value.equals("null") || value.equals("\"\"")) return null;
        try {
            String inner = new JSONArray("[" + value + "]").getString(0);
            if (inner.isEmpty()) return null;
            return new JSONObject(inner);
        } catch (JSONException e) {
            return null;
        }
    }

    /** Proves the session reads attendance before calling it connected. */
    private void verify(final String cookie, final JSONObject ids, final String ua) {
        checking = true;
        note.setText("Signed in. Checking your attendance…");
        final android.content.Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean ok;
                try {
                    Camu.save(app, cookie, ids, ua);
                    ok = Camu.attendance(app) != null;
                } catch (Exception e) {
                    ok = false;
                }
                final boolean works = ok;
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        checking = false;
                        if (!works) {
                            note.setText("Sign in with Microsoft, like always. DockIn only reads attendance.");
                            return;
                        }
                        done = true;
                        CookieManager.getInstance().flush();
                        DockInPlugin.camuFinished(true, ids.optString("name", ""));
                        finish();
                    }
                });
            }
        }, "dockin-camu-check").start();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (!popups.isEmpty()) {
            closePopup(popups.get(popups.size() - 1));
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(poll);
        handler.removeCallbacks(reveal);
        if (!done) DockInPlugin.camuFinished(false, null);
        for (WebView w : new ArrayList<>(popups)) closePopup(w);
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
