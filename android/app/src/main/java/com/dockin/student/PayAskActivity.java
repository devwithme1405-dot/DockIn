package com.dockin.student;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * "₹450 paid to Dominos Pizza — what was it for?", over whatever is on screen.
 *
 * The moment you pay is the only moment you remember what it was for, so this
 * comes up right then — over GPay, over the lock-free home screen, with DockIn
 * itself not running. It is plain native views (no web page to load), so it is
 * instant. Your answer is kept on the phone next to the payment, and the app
 * turns it into an expense or a Lend &amp; Borrow entry the next time it opens.
 *
 * Shown on its own only when "Display over other apps" is allowed; otherwise it
 * opens from the payment notification.
 */
public class PayAskActivity extends Activity {

    static final String EXTRA_AMOUNT = "amount";
    static final String EXTRA_MERCHANT = "merchant";
    static final String EXTRA_AT = "at";
    static final String EXTRA_ID = "nid";
    static final String EXTRA_MODE = "mode";

    private static final int INK = 0xFF2B1D10;
    private static final int MUTED = 0xFF7A6650;
    private static final int PAPER = 0xFFFBF3E4;
    private static final int EDGE = 0xFFE2CFA9;
    private static final int CREAM = 0xFFF3E6CC;
    private static final int LEATHER = 0xFF6B3E1E;
    private static final int PURPLE = 0xFF6A3DE8;
    private static final int GREEN = 0xFF2E7D32;

    private double amount;
    private String merchant;
    private long at;
    private int nid;
    private float dp;
    private LinearLayout card;
    private final Handler handler = new Handler(Looper.getMainLooper());

    /** Can the popup come up by itself, with no tap? */
    static boolean canPopUp(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    static Intent intent(Context c, double amount, String merchant, long at, int nid, String mode) {
        Intent i = new Intent(c, PayAskActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION)
                .putExtra(EXTRA_AMOUNT, amount)
                .putExtra(EXTRA_AT, at)
                .putExtra(EXTRA_ID, nid);
        if (merchant != null) i.putExtra(EXTRA_MERCHANT, merchant);
        if (mode != null) i.putExtra(EXTRA_MODE, mode);
        return i;
    }

    static PendingIntent pending(Context c, int code, double amount, String merchant, long at, int nid, String mode) {
        return PendingIntent.getActivity(c, code, intent(c, amount, merchant, at, nid, mode),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Brings the popup up straight away, if Android lets this app do that. */
    static void show(Context c, double amount, String merchant, long at, int nid) {
        if (!canPopUp(c)) return;
        try {
            c.startActivity(intent(c, amount, merchant, at, nid, null));
        } catch (RuntimeException e) {
            // Blocked by the system or a vendor skin: the notification is still there.
        }
    }

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Intent i = getIntent();
        if (i == null) {
            finish();
            return;
        }
        amount = i.getDoubleExtra(EXTRA_AMOUNT, 0);
        merchant = i.getStringExtra(EXTRA_MERCHANT);
        at = i.getLongExtra(EXTRA_AT, System.currentTimeMillis());
        nid = i.getIntExtra(EXTRA_ID, 0);
        if (amount <= 0 || PayInbox.answered(this, amount, at)) {
            finish();
            return;
        }
        dp = getResources().getDisplayMetrics().density;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(0x80140A02);
        // A tap on the dimmed part is "later": the payment stays in the tray.
        root.setOnClickListener(v -> finish());

        card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setClickable(true);
        card.setPadding(px(22), px(14), px(22), px(26));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PAPER);
        float r = px(28);
        bg.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        bg.setStroke(px(1), EDGE);
        card.setBackground(bg);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(card, lp);
        setContentView(root);

        String mode = i.getStringExtra(EXTRA_MODE);
        if ("me".equals(mode)) showMe();
        else if ("other".equals(mode)) showOther();
        else showChoose();
    }

    // ---------------------------------------------------------------- screens

    private void showChoose() {
        reset("What was it for?");
        card.addView(button("For me", true, v -> showMe()), fill(52, 6));
        card.addView(button("For someone — they'll pay me back", false, v -> showOther()), fill(52, 10));
        card.addView(button("Split with friends", false, v -> openApp("split")), fill(52, 10));
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(link("Later", v -> finish()), new LinearLayout.LayoutParams(0, px(44), 1f));
        row.addView(link("Not a spend", v -> save(answer("ignore", null, null), "Okay, left out.")),
                new LinearLayout.LayoutParams(0, px(44), 1f));
        card.addView(row, fill(44, 8));
    }

    private void showMe() {
        reset("Pick what it was");
        JSONArray cats = PayInbox.choices(this).optJSONArray("categories");
        if (cats == null || cats.length() == 0) {
            cats = new JSONArray();
            cats.put(cat("food", "Food", ""));
            cats.put(cat("travel", "Travel", ""));
            cats.put(cat("shopping", "Shopping", ""));
            cats.put(cat("other", "Other", ""));
        }
        LinearLayout row = null;
        int n = Math.min(cats.length(), 12);
        for (int k = 0; k < n; k++) {
            JSONObject c = cats.optJSONObject(k);
            if (row == null || k % 3 == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                card.addView(row, fill(48, 8));
            }
            if (c == null) c = cat("other", "Other", "");
            final String id = c.optString("id");
            final String label = c.optString("label", id);
            String emoji = c.optString("emoji", "");
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, px(48), 1f);
            p.setMargins(k % 3 == 0 ? 0 : px(4), 0, k % 3 == 2 ? 0 : px(4), 0);
            row.addView(chip((emoji.isEmpty() ? "" : emoji + " ") + label,
                    v -> save(answer("me", id, null), money() + " added to " + label + ".")), p);
        }
        // Keep the row count even so the last one does not stretch.
        if (n % 3 != 0 && row != null) {
            for (int k = n % 3; k < 3; k++) row.addView(new View(this), new LinearLayout.LayoutParams(0, px(48), 1f));
        }
        card.addView(link("‹ Back", v -> showChoose()), fill(44, 8));
    }

    private void showOther() {
        reset("Who was it for?");
        final EditText name = new EditText(this);
        name.setHint("Their name");
        name.setSingleLine(true);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        name.setTextColor(INK);
        name.setPadding(px(16), 0, px(16), 0);
        name.setBackground(round(0xFFFFFFFF, EDGE, 16));
        card.addView(name, fill(52, 6));

        JSONArray people = PayInbox.choices(this).optJSONArray("people");
        if (people != null && people.length() > 0) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            int n = Math.min(people.length(), 4);
            for (int k = 0; k < n; k++) {
                final String who = people.optString(k);
                if (who == null || who.isEmpty()) continue;
                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, px(42), 1f);
                p.setMargins(k == 0 ? 0 : px(4), 0, k == n - 1 ? 0 : px(4), 0);
                row.addView(chip(who, v -> forSomeone(who)), p);
            }
            card.addView(row, fill(42, 10));
        }
        card.addView(button("Add to Lend & Borrow", true, v -> {
            String who = name.getText() == null ? "" : name.getText().toString().trim();
            if (who.isEmpty()) {
                name.setHint("Type a name first");
                return;
            }
            forSomeone(who);
        }), fill(52, 12));
        card.addView(link("‹ Back", v -> showChoose()), fill(44, 6));
    }

    private void forSomeone(String who) {
        String clean = who.length() > 40 ? who.substring(0, 40) : who;
        save(answer("other", null, clean), clean + " owes you " + money() + ".");
    }

    // ---------------------------------------------------------------- saving

    private JSONObject answer(String who, String category, String person) {
        JSONObject a = new JSONObject();
        try {
            a.put("who", who);
            if (category != null) a.put("category", category);
            if (person != null) a.put("person", person);
            a.put("answeredAt", System.currentTimeMillis());
        } catch (JSONException ignored) {
        }
        return a;
    }

    private void save(JSONObject a, String said) {
        PayInbox.answer(this, amount, at, a);
        if (nid != 0) {
            try {
                NotificationManagerCompat.from(this).cancel(nid);
            } catch (RuntimeException ignored) {
            }
        }
        card.removeAllViews();
        card.addView(text("✓  " + said, 18, GREEN, true), fill(-2, 10));
        if (!"ignore".equals(a.optString("who"))) {
            card.addView(text("It's saved. You'll see it in Money when you open DockIn.", 14, MUTED, false), fill(-2, 6));
        }
        handler.postDelayed(this::finish, 1400);
    }

    private void openApp(String who) {
        Intent i = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, "/money?pay=" + param() + "&at=" + at + "&who=" + who);
        try {
            startActivity(i);
        } catch (RuntimeException ignored) {
        }
        finish();
    }

    // ---------------------------------------------------------------- views

    private void reset(String question) {
        card.removeAllViews();
        View grip = new View(this);
        grip.setBackground(round(EDGE, 0, 3));
        LinearLayout.LayoutParams g = new LinearLayout.LayoutParams(px(40), px(5));
        g.gravity = Gravity.CENTER_HORIZONTAL;
        g.setMargins(0, 0, 0, px(14));
        card.addView(grip, g);
        card.addView(text("DOCKIN · PAYMENT", 12, PURPLE, true), fill(-2, 0));
        String head = merchant != null && !merchant.isEmpty() ? money() + " paid to " + merchant : money() + " paid";
        card.addView(text(head, 22, INK, true), fill(-2, 4));
        card.addView(text(question, 15, MUTED, false), fill(-2, 4));
        View gap = new View(this);
        card.addView(gap, fill(10, 0));
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView button(String s, boolean primary, View.OnClickListener l) {
        TextView b = text(s, 16, primary ? 0xFFFFFFFF : LEATHER, true);
        b.setGravity(Gravity.CENTER);
        b.setBackground(primary ? round(LEATHER, 0, 16) : round(CREAM, EDGE, 16));
        b.setOnClickListener(l);
        return b;
    }

    private TextView chip(String s, View.OnClickListener l) {
        TextView b = text(s, 14, INK, true);
        b.setGravity(Gravity.CENTER);
        b.setSingleLine(true);
        b.setBackground(round(CREAM, EDGE, 14));
        b.setOnClickListener(l);
        return b;
    }

    private TextView link(String s, View.OnClickListener l) {
        TextView b = text(s, 15, MUTED, true);
        b.setGravity(Gravity.CENTER);
        b.setOnClickListener(l);
        return b;
    }

    private GradientDrawable round(int fill, int stroke, int radiusDp) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(px(radiusDp));
        if (stroke != 0) d.setStroke(px(1), stroke);
        return d;
    }

    private LinearLayout.LayoutParams fill(int heightDp, int topDp) {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, heightDp < 0 ? ViewGroup.LayoutParams.WRAP_CONTENT : px(heightDp));
        p.setMargins(0, px(topDp), 0, 0);
        return p;
    }

    private JSONObject cat(String id, String label, String emoji) {
        JSONObject o = new JSONObject();
        try {
            o.put("id", id);
            o.put("label", label);
            o.put("emoji", emoji);
        } catch (JSONException ignored) {
        }
        return o;
    }

    private int px(int v) {
        return Math.round(v * dp);
    }

    private String money() {
        return PayNotifier.rupees(amount);
    }

    private String param() {
        if (amount == Math.rint(amount)) return String.valueOf((long) amount);
        return String.format(java.util.Locale.US, "%.2f", amount);
    }
}
