package com.dockin.student;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * The app: DockIn's site in a WebView, with the phone's own powers wired in
 * through {@link DockInPlugin}.
 */
public class MainActivity extends BridgeActivity {

    /** Which screen to open, set by DockIn's own notifications. */
    static final String EXTRA_OPEN = "com.dockin.student.OPEN";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Plugins written inside the app are not found automatically; they are
        // registered before the bridge is built.
        registerPlugin(DockInPlugin.class);
        super.onCreate(savedInstanceState);

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
