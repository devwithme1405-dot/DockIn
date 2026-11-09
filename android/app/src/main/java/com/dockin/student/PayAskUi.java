package com.dockin.student;

import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
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
 * The "₹450 paid — what was it for?" sheet, as plain views.
 *
 * Shared by the floating popup ({@link PayPopup}, drawn over any app straight
 * from the background) and {@link PayAskActivity} (opened from the payment
 * notification). The host decides how it is shown and closed.
 */
final class PayAskUi {

    interface Host {
        void close();

        /** The name field needs the keyboard; a floating window must ask for focus. */
        void keyboard(boolean on);
    }

    private static final int INK = 0xFF2B1D10;
    private static final int MUTED = 0xFF7A6650;
    private static final int PAPER = 0xFFFBF3E4;
    private static final int EDGE = 0xFFE2CFA9;
    private static final int CREAM = 0xFFF3E6CC;
    private static final int LEATHER = 0xFF6B3E1E;
    private static final int PURPLE = 0xFF6A3DE8;
    private static final int GREEN = 0xFF2E7D32;

    private final Context c;
    private final double amount;
    private final String merchant;
    private final String source;
    private final long at;
    private final int nid;
    private final Host host;
    private final float dp;
    private final LinearLayout card;
    private final FrameLayout root;
    private final Handler handler = new Handler(Looper.getMainLooper());

    PayAskUi(Context c, double amount, String merchant, String source, long at, int nid, String mode, Host host) {
        this.c = c;
        this.amount = amount;
        this.merchant = merchant;
        this.source = source;
        this.at = at;
        this.nid = nid;
        this.host = host;
        this.dp = c.getResources().getDisplayMetrics().density;

        root = new FrameLayout(c);
        root.setBackgroundColor(0x99140A02);
        // A tap on the dimmed part is "later": the payment stays in the tray.
        root.setOnClickListener(v -> host.close());

        card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setClickable(true);
        card.setPadding(px(22), px(14), px(22), px(30));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PAPER);
        float r = px(30);
        bg.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        bg.setStroke(px(1), EDGE);
        card.setBackground(bg);
        root.addView(card, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        if ("me".equals(mode)) showMe();
        else if ("other".equals(mode)) showOther();
        else showChoose();
        // Slides up, so it is noticed even mid-scroll in another app.
        card.setTranslationY(px(420));
        card.animate().translationY(0).setDuration(260).start();
    }

    View root() {
        return root;
    }

    // ---------------------------------------------------------------- screens

    private void showChoose() {
        reset("What was it for?");
        card.addView(button("For me", true, v -> showMe()), fill(58, 6));
        card.addView(button("For someone — they'll pay me back", false, v -> showOther()), fill(58, 10));
        card.addView(button("Split with friends", false, v -> openApp("split")), fill(58, 10));
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(link("Later", v -> host.close()), new LinearLayout.LayoutParams(0, px(44), 1f));
        row.addView(link("Not a spend", v -> save(answer("ignore", null, null), "Okay, left out.")),
                new LinearLayout.LayoutParams(0, px(44), 1f));
        card.addView(row, fill(44, 8));
    }

    private void showMe() {
        reset("Pick what it was");
        JSONArray cats = PayInbox.choices(c).optJSONArray("categories");
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
            JSONObject co = cats.optJSONObject(k);
            if (row == null || k % 3 == 0) {
                row = new LinearLayout(c);
                row.setOrientation(LinearLayout.HORIZONTAL);
                card.addView(row, fill(48, 8));
            }
            if (co == null) co = cat("other", "Other", "");
            final String id = co.optString("id");
            final String label = co.optString("label", id);
            String emoji = co.optString("emoji", "");
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, px(48), 1f);
            p.setMargins(k % 3 == 0 ? 0 : px(4), 0, k % 3 == 2 ? 0 : px(4), 0);
            row.addView(chip((emoji.isEmpty() ? "" : emoji + " ") + label,
                    v -> save(answer("me", id, null), money() + " added to " + label + ".")), p);
        }
        // Keep the row count even so the last one does not stretch.
        if (n % 3 != 0 && row != null) {
            for (int k = n % 3; k < 3; k++) row.addView(new View(c), new LinearLayout.LayoutParams(0, px(48), 1f));
        }
        card.addView(link("‹ Back", v -> showChoose()), fill(44, 8));
    }

    private void showOther() {
        reset("Who was it for?");
        final EditText name = new EditText(c);
        name.setHint("Their name");
        name.setSingleLine(true);
        name.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        name.setTextColor(INK);
        name.setPadding(px(16), 0, px(16), 0);
        name.setBackground(round(0xFFFFFFFF, EDGE, 16));
        card.addView(name, fill(56, 6));
        host.keyboard(true);
        name.requestFocus();

        JSONArray people = PayInbox.choices(c).optJSONArray("people");
        if (people != null && people.length() > 0) {
            LinearLayout row = new LinearLayout(c);
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
        card.addView(link("‹ Back", v -> {
            host.keyboard(false);
            showChoose();
        }), fill(44, 6));
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
        PayInbox.answer(c, amount, at, a);
        if (nid != 0) {
            try {
                NotificationManagerCompat.from(c).cancel(nid);
            } catch (RuntimeException ignored) {
            }
        }
        card.removeAllViews();
        card.addView(text("✓  " + said, 18, GREEN, true), fill(-2, 10));
        if (!"ignore".equals(a.optString("who"))) {
            card.addView(text("It's saved. You'll see it in Money when you open DockIn.", 14, MUTED, false), fill(-2, 6));
        }
        handler.postDelayed(host::close, 1500);
    }

    private void openApp(String who) {
        Intent i = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, "/money?pay=" + param() + "&at=" + at + "&who=" + who);
        try {
            c.startActivity(i);
        } catch (RuntimeException ignored) {
        }
        host.close();
    }

    // ---------------------------------------------------------------- views

    private void reset(String question) {
        card.removeAllViews();
        View grip = new View(c);
        grip.setBackground(round(EDGE, 0, 3));
        LinearLayout.LayoutParams g = new LinearLayout.LayoutParams(px(44), px(5));
        g.gravity = Gravity.CENTER_HORIZONTAL;
        g.setMargins(0, 0, 0, px(14));
        card.addView(grip, g);

        LinearLayout top = new LinearLayout(c);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView badge = text("  PAYMENT DETECTED" + (source != null ? "  ·  " + source.toUpperCase(java.util.Locale.ROOT) : "") + "  ", 12, 0xFFFFFFFF, true);
        badge.setBackground(round(PURPLE, 0, 10));
        badge.setPadding(px(8), px(5), px(8), px(5));
        top.addView(badge, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView x = text("✕", 20, MUTED, true);
        x.setGravity(Gravity.CENTER);
        x.setOnClickListener(v -> host.close());
        top.addView(x, new LinearLayout.LayoutParams(px(40), px(40)));
        card.addView(top, fill(-2, 0));

        card.addView(text(money(), 46, INK, true), fill(-2, 8));
        if (merchant != null && !merchant.isEmpty()) {
            card.addView(text("paid to " + merchant, 19, INK, false), fill(-2, 0));
        }
        card.addView(text(question, 16, MUTED, true), fill(-2, 10));
        View gap = new View(c);
        card.addView(gap, fill(8, 0));
    }

    private TextView text(String s, int sp, int color, boolean bold) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        return t;
    }

    private TextView button(String s, boolean primary, View.OnClickListener l) {
        TextView b = text(s, 17, primary ? 0xFFFFFFFF : LEATHER, true);
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
