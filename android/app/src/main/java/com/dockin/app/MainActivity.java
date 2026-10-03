package com.dockin.app;

import android.net.Uri;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * The app's front door, and the whole of the pairing.
 *
 * The phone makes itself a secret the first time it starts and simply carries
 * it on the address it opens the site with. The site is already signed in, so
 * it tells the server to trust that secret and tidies it out of the address.
 * Nobody taps anything, nobody is told what a device token is, and there is no
 * screen in between.
 *
 * This replaces a hand-over that asked the person to press a button that minted
 * a token and bounced it back through a link. It worked on paper and was
 * miserable in practice — which is the only test that counts.
 */
public class MainActivity extends LauncherActivity {

    @Override
    protected Uri getLaunchingUrl() {
        Uri base = super.getLaunchingUrl();
        if (base == null) return null;
        // Already carrying one (the site reopened itself): leave it alone.
        if (base.getQueryParameter("dev") != null) return base;
        return base.buildUpon().appendQueryParameter("dev", PayLink.secret(this)).build();
    }
}
