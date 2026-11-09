package com.dockin.student;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;

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

        // From here on payment reading survives the app being closed.
        // The old always-on "Watching for payments" notification is gone for good.
        try {
            androidx.core.app.NotificationManagerCompat.from(this).deleteNotificationChannel("guard");
        } catch (RuntimeException ignored) {
        }
        PayHealth.schedule(this);
        PayHealth.check(this);

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
