package com.dockin.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * The app's front door, and the whole of the pairing.
 *
 * The phone makes itself a secret the first time it starts and carries it on
 * the address it opens the site with. The site is already signed in, so it
 * tells the server to trust that secret and tidies it out of the address.
 * Nobody taps anything and there is no screen in between.
 *
 * It also sends its own version, and a flag meaning "this build has the
 * listener in it". That flag is what turns "the switch does nothing" into "your
 * app came before this feature" — a question no web page can otherwise answer,
 * and the exact confusion this cost an evening over.
 *
 * It works by putting the address on the launch intent before the library sees
 * it, rather than overriding how the library builds that address. Both would
 * do; this one uses nothing but core Android, so a library upgrade cannot
 * quietly take the feature away.
 */
public class MainActivity extends LauncherActivity {

    private static final String DEFAULT_URL = "android.support.customtabs.trusted.DEFAULT_URL";

    @Override
    protected void onCreate(Bundle state) {
        Intent intent = getIntent();
        // Opened from a link: that address is the point, so leave it alone.
        if (intent != null && intent.getData() == null) {
            Uri site = site();
            if (site != null) {
                intent.setData(
                        site.buildUpon()
                                .appendQueryParameter("dev", PayLink.secret(this))
                                .appendQueryParameter("app", version())
                                .appendQueryParameter("pay", "1")
                                .build());
                setIntent(intent);
            }
        }
        super.onCreate(state);
    }

    /** The address this app was built around, as the manifest states it. */
    private Uri site() {
        try {
            ActivityInfo info =
                    getPackageManager().getActivityInfo(getComponentName(), PackageManager.GET_META_DATA);
            String url = info.metaData == null ? null : info.metaData.getString(DEFAULT_URL);
            return url == null ? null : Uri.parse(url);
        } catch (Exception e) {
            return null;
        }
    }

    private String version() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }
}
