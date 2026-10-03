package com.dockin.app;

import android.content.pm.PackageManager;
import android.net.Uri;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * The app's front door, and the whole of the pairing.
 *
 * The phone makes itself a secret the first time it starts and carries it on
 * the address it opens the site with. The site is already signed in, so it
 * tells the server to trust that secret and tidies it out of the address.
 * Nobody taps anything and there is no screen in between.
 *
 * It also sends its own version. That one string is what turns "the button does
 * nothing" into "you are on an older app" — a question nobody can otherwise
 * answer from inside a web page, and the exact confusion this feature caused
 * the first time round.
 */
public class MainActivity extends LauncherActivity {

    @Override
    protected Uri getLaunchingUrl() {
        Uri base = super.getLaunchingUrl();
        if (base == null) return null;
        // Already carrying it (the site reopened itself): leave it alone.
        if (base.getQueryParameter("dev") != null) return base;
        return base.buildUpon()
                .appendQueryParameter("dev", PayLink.secret(this))
                .appendQueryParameter("app", version())
                // Says this build has the notification listener in it. The site
                // cannot test for that any other way, and without it an old APK
                // and a working one look identical from a web page — the symptom
                // being a switch that silently opens nothing.
                .appendQueryParameter("pay", "1")
                .build();
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "?";
        }
    }
}
