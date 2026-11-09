package com.dockin.student;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;

/**
 * The payment sheet as a screen, opened by tapping the payment notification
 * (always allowed, unlike starting a screen from the background). It opens
 * on top of whatever app is showing, not inside DockIn.
 */
public class PayAskActivity extends Activity {

    static final String EXTRA_AMOUNT = "amount";
    static final String EXTRA_MERCHANT = "merchant";
    static final String EXTRA_SOURCE = "source";
    static final String EXTRA_AT = "at";
    static final String EXTRA_ID = "nid";
    static final String EXTRA_MODE = "mode";

    static Intent intent(Context c, double amount, String merchant, String source, long at, int nid, String mode) {
        Intent i = new Intent(c, PayAskActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION)
                .putExtra(EXTRA_AMOUNT, amount)
                .putExtra(EXTRA_AT, at)
                .putExtra(EXTRA_ID, nid);
        if (merchant != null) i.putExtra(EXTRA_MERCHANT, merchant);
        if (source != null) i.putExtra(EXTRA_SOURCE, source);
        if (mode != null) i.putExtra(EXTRA_MODE, mode);
        return i;
    }

    static PendingIntent pending(Context c, int code, double amount, String merchant, String source, long at, int nid, String mode) {
        return PendingIntent.getActivity(c, code, intent(c, amount, merchant, source, at, nid, mode),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Intent i = getIntent();
        if (i == null) {
            finish();
            return;
        }
        double amount = i.getDoubleExtra(EXTRA_AMOUNT, 0);
        long at = i.getLongExtra(EXTRA_AT, System.currentTimeMillis());
        if (amount <= 0 || PayInbox.answered(this, i.getIntExtra(EXTRA_ID, 0), amount, at)) {
            finish();
            return;
        }
        PayAskUi ui = new PayAskUi(this, amount, i.getStringExtra(EXTRA_MERCHANT), i.getStringExtra(EXTRA_SOURCE), at,
                i.getIntExtra(EXTRA_ID, 0), i.getStringExtra(EXTRA_MODE), new PayAskUi.Host() {
                    @Override
                    public void close() {
                        finish();
                    }
                });
        setContentView(ui.root());
    }
}
