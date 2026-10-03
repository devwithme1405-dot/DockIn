package com.dockin.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/**
 * The hand-over, when the web app links this phone.
 *
 * The signed-in web app opens dockin://pay/<token>?u=<project>&k=<public key>,
 * which only this app can answer. The token is kept here and never goes back to
 * the browser. Straight afterwards Android's own notification-access screen is
 * opened, because that permission can only be granted there — the app cannot
 * give itself anything.
 */
public class LinkActivity extends Activity {

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        Uri data = getIntent() == null ? null : getIntent().getData();
        String token = data == null ? null : lastSegment(data);
        String url = data == null ? null : data.getQueryParameter("u");
        String key = data == null ? null : data.getQueryParameter("k");

        if (token == null || token.isEmpty() || url == null || url.isEmpty()) {
            Toast.makeText(this, R.string.pay_link_failed, Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        PayLink.save(this, token, url.replaceAll("/+$", ""), key == null ? "" : key);
        Toast.makeText(this, R.string.pay_link_ok, Toast.LENGTH_LONG).show();

        try {
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            // Some phones hide that screen; the link is still saved, and
            // turning the permission on by hand works just as well.
            Toast.makeText(this, R.string.pay_link_manual, Toast.LENGTH_LONG).show();
        }
        finish();
    }

    private static String lastSegment(Uri uri) {
        String path = uri.getPath();
        if (path == null) return null;
        String[] parts = path.split("/");
        return parts.length == 0 ? null : parts[parts.length - 1];
    }
}
