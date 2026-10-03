package com.dockin.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;

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
                                // Whether the person has actually granted the
                                // listener. Without this the site can tell you
                                // the app is capable but not whether it is
                                // allowed, which is the one step that is
                                // genuinely someone else's to take.
                                .appendQueryParameter("notif", listening() ? "1" : "0")
                                .build());
                setIntent(intent);
            }
        }
        super.onCreate(state);

        // A heartbeat, on every launch. It proves the phone can reach the site
        // and that the site knows this phone — the two links in the chain that
        // are otherwise invisible, and that a missing payment could be blamed
        // on either.
        PayLink.ping(this);
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

    /** Is this app in Android's list of notification listeners? */
    private boolean listening() {
        try {
            String allowed = Settings.Secure.getString(
                    getContentResolver(), "enabled_notification_listeners");
            return !TextUtils.isEmpty(allowed) && allowed.contains(getPackageName());
        } catch (Exception e) {
            return false;
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
