package com.dockin.student;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
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
import android.content.SharedPreferences;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
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
    /**
     * Just open Camu (signed in) at a path, for things DockIn cannot do itself yet —
     * the leave / gate-pass form. Nothing is wiped and nothing is checked; the bar
     * shows {@link #EXTRA_NOTE} (what to fill in). Requests the page sends while
     * open are noted (see {@link #CAPTURE}) so DockIn can learn Camu's forms.
     */
    static final String EXTRA_BROWSE = "browse";
    static final String EXTRA_PATH = "path";
    static final String EXTRA_NOTE = "note";
    /**
     * A file DockIn already holds for this form (the leave's parent-approval mail
     * screenshot). When Camu's page asks for a file, it is offered first, so the
     * student does not hunt for the same image twice.
     */
    static final String EXTRA_PROOF = "proof";
    private static final int PICK_FILE = 4107;
    static final String PREFS_CAPTURE = "dockin_camu_capture";
    /** How long to let the remembered sign-in finish before showing the page. */
    private static final long REVEAL_AFTER_MS = 12_000;

    /** Reads the student's ids out of Camu's own saved state, or "" before sign-in. */
    private static final String READ_IDS =
            "(function(){try{var r=localStorage.getItem('persist:root');if(!r)return '';"
                    + "var cs=JSON.parse(r).common||'{}';var c=JSON.parse(cs);var p=c.Progression;"
                    + "if(!p||!p.StuID||!p.CmProgID&&!p._id)return '';"
                    + "var n=(c.loginDetails&&c.loginDetails.Name)||'';"
                    // The enrollment number (e.g. S25CSEU0155): from a named field
                    // first, else the college email's local part, else any value
                    // that is exactly one. It becomes the DockIn username.
                    + "var E=/^([A-Za-z]{1,2}\\d{2}[A-Za-z]{2,6}\\d{2,6})(@[A-Za-z0-9.-]+)?$/;"
                    + "var en='',ld=c.loginDetails||{},ks=['EnrollmentNo','EnrNo','EnrlNo','RollNo','RegNo','AdmNo','StudentId','Email','EmailID','EmailId','email','UserName','LoginID','LoginId'];"
                    + "for(var i=0;i<ks.length&&!en;i++){var v=ld[ks[i]]||p[ks[i]];var m=E.exec(String(v||'').trim());if(m)en=m[1].toUpperCase();}"
                    + "if(!en){var re=/\"([A-Za-z]{1,2}\\d{2}[A-Za-z]{2,6}\\d{2,6})(?:@[A-Za-z0-9.-]+)?\"/g,mm,seen={};"
                    + "while((mm=re.exec(cs))){seen[mm[1].toUpperCase()]=1;}var all=Object.keys(seen);if(all.length===1)en=all[0];}"
                    + "return JSON.stringify({InId:p.InId,PrID:p.PrID,CrID:p.CrID,DeptID:p.DeptID,SemID:p.SemID,"
                    + "AcYr:p.AcYr,CmProgID:p._id||p.CmProgID,StuID:p.StuID,isFE:!!p.isFE,name:n,sem:p.SemName||'',enr:en});"
                    + "}catch(e){return ''}})()";

    /** Empties Camu's localStorage, sessionStorage and IndexedDB for its origin. */
    private static final String WIPE =
            "(function(){try{localStorage.clear();sessionStorage.clear();}catch(e){}"
                    + "try{if(indexedDB&&indexedDB.databases){indexedDB.databases().then(function(d){"
                    + "d.forEach(function(x){if(x&&x.name)indexedDB.deleteDatabase(x.name);});});}}catch(e){}"
                    + "return 'ok';})()";

    /**
     * Notes every non-GET request the Camu page sends (url, body, status, a slice of
     * the answer) so the leave / gate-pass submit can later be replayed from DockIn.
     * Files are recorded by name and size only, never their contents.
     */
    private static final String CAPTURE =
            "(function(){if(window.__dockinCap)return;window.__dockinCap=1;"
                    + "function body(b){try{if(!b)return '';if(typeof b==='string')return b.slice(0,6000);"
                    + "if(typeof Blob!=='undefined'&&b instanceof Blob)return JSON.stringify({blob:b.type,size:b.size,name:b.name||''});"
                    + "if(b instanceof FormData){var o={};b.forEach(function(v,k){o[k]=(v&&v.name!==undefined&&v.size!==undefined)"
                    + "?{file:v.name,type:v.type,size:v.size}:String(v).slice(0,2000);});return JSON.stringify({formData:o});}"
                    + "return String(b).slice(0,2000);}catch(e){return '?'}}"
                    + "var CH=/canc|cncl|cnl|withdr|revok|delet|dlt|remov|rmv|updt|update|stus|status|lv\\b|leave|gatepass/i;var AN=/google-analytics|googletagmanager|doubleclick|facebook\\.|clarity\\.ms|hotjar|sentry|mixpanel|segment\\.io/i;"
                    + "function note(m,u,b,st,r){try{if(AN.test(String(u)))return;DockInCapture.note(JSON.stringify({at:Date.now(),page:location.pathname+location.hash,"
                    + "method:m,url:String(u),body:body(b),status:st,answer:String(r||'').slice(0,3000)}));}catch(e){}}"
                    + "var O=XMLHttpRequest.prototype.open,S=XMLHttpRequest.prototype.send;"
                    + "XMLHttpRequest.prototype.open=function(m,u){this.__m=m;this.__u=u;return O.apply(this,arguments);};"
                    + "XMLHttpRequest.prototype.send=function(b){var x=this;if(x.__m&&(String(x.__m).toUpperCase()!=='GET'||CH.test(String(x.__u)))){"
                    + "x.addEventListener('loadend',function(){var r='';try{r=x.responseType===''||x.responseType==='text'?x.responseText:'';}catch(e){}"
                    + "note(x.__m,x.__u,b,x.status,r);});}return S.apply(this,arguments);};"
                    + "if(window.fetch){var F=window.fetch;window.fetch=function(i,o){var m=(o&&o.method)||(i&&typeof i!=='string'&&i.method)||'GET';var p=F.apply(this,arguments);"
                    + "if(String(m).toUpperCase()!=='GET'||CH.test(String(typeof i==='string'?i:(i&&i.url)))){p.then(function(res){res.clone().text().then(function(t){note(m,(typeof i==='string'?i:(i&&i.url))||res.url,o&&o.body,res.status,t);});}).catch(function(){});}"
                    + "return p;};}})()";

    /** Words that mark a leave / gate-pass request in what Camu sends. */
    static final java.util.regex.Pattern PASSY =
            java.util.regex.Pattern.compile("(?i)leave|gate|outpass|out_pass|lvreq|lvapp|upload|attach");

    /** URLs that only read (lists, configs) — not the request that makes a pass. */
    static final java.util.regex.Pattern READS =
            java.util.regex.Pattern.compile("(?i)/(get|list|fetch|search|count|view)[^/]*/?$|getall|config|dashboard|summary");

    /** Hosts that only count visits — never part of making a pass. */
    static final java.util.regex.Pattern ANALYTICS = java.util.regex.Pattern.compile(
            "(?i)google-analytics|googletagmanager|doubleclick|facebook\\.|clarity\\.ms|hotjar|sentry|mixpanel|segment\\.io");

    /** Appends one noted request to a capped list under {@code key}. */
    static void keepIn(SharedPreferences p, SharedPreferences.Editor e, String key, String json, int max) {
        JSONArray had;
        try {
            had = new JSONArray(p.getString(key, "[]"));
        } catch (JSONException x) {
            had = new JSONArray();
        }
        try {
            had.put(new JSONObject(json));
        } catch (JSONException x) {
            return;
        }
        JSONArray last = new JSONArray();
        for (int i = Math.max(0, had.length() - max); i < had.length(); i++) last.put(had.opt(i));
        e.putString(key, last.toString());
    }

    /** Receives what {@link #CAPTURE} notes; keeps the last 25. */
    static final class Capture {
        private final android.content.Context app;

        Capture(android.content.Context app) {
            this.app = app;
        }

        @JavascriptInterface
        public void note(String json) {
            String url = "";
            try {
                url = new JSONObject(json).optString("url", "");
            } catch (JSONException x) {
                return;
            }
            // Analytics beacons are long and constant; they only push the real requests out.
            if (ANALYTICS.matcher(url).find()) return;
            Camu.learnLoginId(app, json);
            SharedPreferences p = app.getSharedPreferences(PREFS_CAPTURE, MODE_PRIVATE);
            JSONArray list;
            try {
                list = new JSONArray(p.getString("items", "[]"));
            } catch (JSONException e) {
                list = new JSONArray();
            }
            try {
                list.put(new JSONObject(json));
            } catch (JSONException e) {
                return;
            }
            JSONArray keep = new JSONArray();
            for (int i = Math.max(0, list.length() - 25); i < list.length(); i++) keep.put(list.opt(i));
            SharedPreferences.Editor e = p.edit().putString("items", keep.toString());
            // Camu sends plenty of other requests; the leave / gate-pass ones are
            // the point, so they are also kept in a list of their own.
            if (PASSY.matcher(json).find()) {
                // (the page path is in the JSON, so a storage upload made from the
                // leave page counts too, whatever its host)
                keepIn(p, e, "picked", json, 12);
                // MyCamu re-reads the pass list every few seconds; what it *sends*
                // (the submit, the upload) is kept apart so those reads can't push it out.
                if (!url.isEmpty() && !READS.matcher(url).find()) keepIn(p, e, "writes", json, 20);
            }
            e.apply();
        }
    }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<WebView> popups = new ArrayList<>();
    private FrameLayout root;
    private WebView web;
    private TextView note;
    private TextView close;
    private View cover;
    private boolean silent = false;
    private boolean browse = false;
    private boolean revealed = false;
    private boolean done = false;
    /** Camu's page waiting for a file from the picker. */
    private ValueCallback<Uri[]> pickFor;
    private boolean checking = false;
    /** True while the last person's Camu state is being wiped; no sign-in checks then. */
    private boolean wiping = false;

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
        browse = getIntent() != null && getIntent().getBooleanExtra(EXTRA_BROWSE, false);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setBackgroundColor(0xFF864220);
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

        close = new TextView(this);
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

        final CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, true);

        if (browse) {
            title.setText("Camu");
            String n = getIntent().getStringExtra(EXTRA_NOTE);
            note.setText(n == null || n.isEmpty() ? "Signed in as you." : n);
            close.setText("Done");
            web.addJavascriptInterface(new Capture(getApplicationContext()), "DockInCapture");
            String path = getIntent().getStringExtra(EXTRA_PATH);
            web.loadUrl(Camu.BASE + (path == null || path.isEmpty() ? "/" : path));
            return;
        }
        if (silent) {
            // Renewal reuses the remembered sign-in on purpose.
            web.loadUrl(Camu.BASE + "/");
        } else {
            // A fresh "Connect Camu" must be a real sign-in, never a reuse of whoever
            // signed in last on this phone. Two things remember that person: the
            // cookies (Microsoft + Camu) and Camu's own saved state in its
            // localStorage ("persist:root", which holds their student ids — the very
            // thing check() reads). Clearing only the cookies left the ids behind, so
            // the next person was "signed in" as the last one. Wipe both, for Camu's
            // origin only: the app's own data lives on a different origin and stays.
            wiping = true;
            WebStorage.getInstance().deleteOrigin(Camu.BASE);
            cookies.removeAllCookies(new ValueCallback<Boolean>() {
                @Override
                public void onReceiveValue(Boolean value) {
                    cookies.flush();
                    // A blank page that carries Camu's origin, so its storage can be
                    // cleared without Camu's own scripts running and re-saving it.
                    web.loadDataWithBaseURL(Camu.BASE + "/", "<html><body></body></html>",
                            "text/html", "utf-8", null);
                }
            });
        }
        handler.postDelayed(poll, 2000);
    }

    /** A full-screen brand panel shown over the WebView while the sign-in renews itself. */
    private View reconnectingScreen() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(0xFF864220);
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
                if (view != web) return;
                if (browse) {
                    view.evaluateJavascript(CAPTURE, null);
                    return;
                }
                if (wiping) {
                    wipeCamuStorage();
                    return;
                }
                check();
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            // MyCamu asks "Are you sure?" before cancelling. Without these, Android
            // answers such questions "no" on its own and nothing happens.
            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                if (isFinishing()) return false;
                new AlertDialog.Builder(CamuLoginActivity.this)
                        .setMessage(message)
                        .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int which) {
                                result.confirm();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface d) {
                                result.confirm();
                            }
                        })
                        .show();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                if (isFinishing()) return false;
                new AlertDialog.Builder(CamuLoginActivity.this)
                        .setMessage(message)
                        .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int which) {
                                result.confirm();
                            }
                        })
                        .setNegativeButton("Cancel", new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int which) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface d) {
                                result.cancel();
                            }
                        })
                        .show();
                return true;
            }

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

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                return chooseFile(callback, params);
            }
        });
    }

    /**
     * Camu's page asked for a file (the leave's mail screenshot). Without this the
     * WebView silently ignores the tap. Offers the screenshot DockIn already has,
     * or the phone's own picker.
     */
    private boolean chooseFile(final ValueCallback<Uri[]> callback, final WebChromeClient.FileChooserParams params) {
        if (pickFor != null) pickFor.onReceiveValue(null);
        pickFor = callback;
        String path = getIntent() == null ? null : getIntent().getStringExtra(EXTRA_PROOF);
        final java.io.File proof = path == null ? null : new java.io.File(path);
        if (proof == null || !proof.exists()) {
            openPicker(params);
            return true;
        }
        new AlertDialog.Builder(this)
                .setTitle("Attach a file")
                .setItems(new CharSequence[] {"The mail screenshot from DockIn", "Choose another file"},
                        new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface d, int which) {
                                if (which == 0) give(new Uri[] {Uri.fromFile(proof)});
                                else openPicker(params);
                            }
                        })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override
                    public void onCancel(DialogInterface d) {
                        give(null);
                    }
                })
                .show();
        return true;
    }

    private void openPicker(WebChromeClient.FileChooserParams params) {
        try {
            startActivityForResult(params.createIntent(), PICK_FILE);
        } catch (ActivityNotFoundException e) {
            give(null);
        }
    }

    /** Always answer the page, even with nothing, or it never asks again. */
    private void give(Uri[] files) {
        ValueCallback<Uri[]> c = pickFor;
        pickFor = null;
        if (c != null) c.onReceiveValue(files);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE) {
            give(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    private void closePopup(WebView w) {
        popups.remove(w);
        root.removeView(w);
        w.destroy();
    }

    /** Clears Camu's saved state on the blank Camu-origin page, then opens the real sign-in. */
    private void wipeCamuStorage() {
        web.evaluateJavascript(WIPE, new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                final CookieManager cookies = CookieManager.getInstance();
                cookies.removeAllCookies(new ValueCallback<Boolean>() {
                    @Override
                    public void onReceiveValue(Boolean v) {
                        cookies.flush();
                        wiping = false;
                        web.loadUrl(Camu.BASE + "/");
                    }
                });
            }
        });
    }

    /** Signed in yet? Camu writes the student's ids to its saved state once it has let them in. */
    private void check() {
        if (done || checking || wiping || web == null) return;
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
        give(null);
        if (!done && !browse) DockInPlugin.camuFinished(false, null);
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
