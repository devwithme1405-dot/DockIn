package com.dockin.student;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.TextView;

import org.json.JSONObject;

/**
 * The mess pass, full screen: the QR big on white, the screen at full
 * brightness so the counter's scanner reads it first time, your name under it.
 * Opened from the Mess pass widget. Everything comes from what's saved on the
 * phone, so it opens instantly and works with no network at all.
 */
public class PassActivity extends Activity {

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setContentView(R.layout.activity_pass);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.screenBrightness = 1f; // scanners need a bright screen
        getWindow().setAttributes(lp);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        JSONObject d = Widgets.data(this);
        Bitmap qr = Widgets.image(d.optString("pass", null));
        ImageView img = findViewById(R.id.p_qr);
        TextView empty = findViewById(R.id.p_empty);
        if (qr != null) {
            img.setImageBitmap(qr);
            empty.setVisibility(View.GONE);
        } else {
            img.setVisibility(View.GONE);
            empty.setVisibility(View.VISIBLE);
        }
        set(R.id.p_name, d.optString("passName", ""));
        set(R.id.p_sub, d.optString("passSub", ""));
        set(R.id.p_place, d.optString("passPlace", ""));

        findViewById(R.id.p_close).setOnClickListener(x -> finish());
        findViewById(R.id.p_open).setOnClickListener(x -> {
            startActivity(new Intent(this, MainActivity.class)
                    .putExtra(MainActivity.EXTRA_OPEN, "/cafeteria")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            finish();
        });
    }

    private void set(int id, String s) {
        TextView t = findViewById(id);
        t.setText(s);
        t.setVisibility(s == null || s.isEmpty() ? View.GONE : View.VISIBLE);
    }
}
