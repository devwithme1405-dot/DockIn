package com.dockin.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

/**
 * Opens Android's notification-access screen when the app asks for it.
 *
 * This permission can only be granted on that screen; no app can give it to
 * itself, and no web page can open it. So the site links to dockin://notifications
 * and this is what answers — the one piece of native code the payment feature
 * genuinely needs a person for.
 */
public class LinkActivity extends Activity {

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            Toast.makeText(this, R.string.pay_turn_on, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            // A few phones hide that screen; say where it is rather than nothing.
            Toast.makeText(this, R.string.pay_turn_on_manual, Toast.LENGTH_LONG).show();
        }
        finish();
    }
}
