package com.dockin.student;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.InputType;
import android.text.TextWatcher;
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

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The small "₹450 paid to Dominos — whose was it?" sheet, opened from the
 * payment notification on top of whatever app is open. Three answers:
 * all mine, not a spend, or split — where the split screen also covers
 * "all of it was theirs" (my share ₹0).
 */
final class PayAskUi {

    interface Host {
        void close();
    }

    private static final int INK = 0xFF2B1D10;
    private static final int MUTED = 0xFF7A6650;
    private static final int PAPER = 0xFFFBF3E4;
    private static final int EDGE = 0xFFE2CFA9;
    private static final int CREAM = 0xFFF3E6CC;
    private static final int LEATHER = 0xFF6B3E1E;
    private static final int PURPLE = 0xFF6A3DE8;
    private static final int GREEN = 0xFF2E7D32;
    private static final int RED = 0xFFB3261E;

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

    /** The split screen's rows: index 0 is "Me". */
    private final List<EditText> names = new ArrayList<>();
    private final List<EditText> shares = new ArrayList<>();
    private LinearLayout rows;
    private TextView sum;

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
        // A tap on the dimmed part is "later": the notification stays.
        root.setOnClickListener(v -> host.close());

        card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setClickable(true);
        card.setPadding(px(22), px(14), px(22), px(26));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(PAPER);
        float r = px(28);
        bg.setCornerRadii(new float[] {r, r, r, r, 0, 0, 0, 0});
        bg.setStroke(px(1), EDGE);
        card.setBackground(bg);
        root.addView(card, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        if ("split".equals(mode)) showSplit(2);
        else if ("me".equals(mode)) showMe();
        else showChoose();
        card.setTranslationY(px(380));
        card.animate().translationY(0).setDuration(220).start();
    }

    View root() {
        return root;
    }

    // ---------------------------------------------------------------- screens

    private void showChoose() {
        reset("Whose was it?");
        card.addView(button("All mine", true, v -> showMe()), fill(56, 4));
        card.addView(button("Split  ·  or someone else's", false, v -> showSplit(2)), fill(56, 10));
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.addView(link("Later", v -> host.close()), new LinearLayout.LayoutParams(0, px(44), 1f));
        row.addView(link("Not a spend", v -> save(answer("ignore"), "Okay, left out.")),
                new LinearLayout.LayoutParams(0, px(44), 1f));
        card.addView(row, fill(44, 8));
    }

    private void showMe() {
        reset("What was it? (optional)");
        JSONArray cats = PayInbox.choices(c).optJSONArray("categories");
        if (cats == null || cats.length() == 0) {
            cats = new JSONArray();
            cats.put(cat("food", "Food", ""));
            cats.put(cat("travel", "Travel", ""));
            cats.put(cat("shopping", "Shopping", ""));
        }
        LinearLayout row = null;
        int n = Math.min(cats.length(), 9);
        for (int k = 0; k < n; k++) {
            JSONObject co = cats.optJSONObject(k);
            if (row == null || k % 3 == 0) {
                row = new LinearLayout(c);
                row.setOrientation(LinearLayout.HORIZONTAL);
                card.addView(row, fill(46, 8));
            }
            if (co == null) co = cat("other", "Other", "");
            final String id = co.optString("id");
            final String label = co.optString("label", id);
            String emoji = co.optString("emoji", "");
            LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, px(46), 1f);
            p.setMargins(k % 3 == 0 ? 0 : px(4), 0, k % 3 == 2 ? 0 : px(4), 0);
            row.addView(chip((emoji.isEmpty() ? "" : emoji + " ") + label, v -> {
                JSONObject a = answer("me");
                put(a, "category", id);
                save(a, money() + " saved under " + label + ".");
            }), p);
        }
        if (n % 3 != 0 && row != null) {
            for (int k = n % 3; k < 3; k++) row.addView(new View(c), new LinearLayout.LayoutParams(0, px(46), 1f));
        }
        card.addView(button("Save as mine", true, v -> save(answer("me"), money() + " saved as yours.")), fill(52, 12));
        card.addView(link("‹ Back", v -> showChoose()), fill(40, 4));
    }

    /** Me plus people, each with an amount. "Me" at ₹0 means it was all theirs. */
    private void showSplit(int ways) {
        reset("Who pays what?");
        names.clear();
        shares.clear();
        rows = new LinearLayout(c);
        rows.setOrientation(LinearLayout.VERTICAL);
        card.addView(rows, fill(-2, 0));
        addRow("Me", true);
        for (int k = 1; k < ways; k++) addRow("", false);

        // One tap for the usual cases.
        LinearLayout presets = new LinearLayout(c);
        presets.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams p1 = new LinearLayout.LayoutParams(0, px(40), 1f);
        p1.setMargins(0, 0, px(4), 0);
        presets.addView(chip("Split equally", v -> equal()), p1);
        LinearLayout.LayoutParams p2 = new LinearLayout.LayoutParams(0, px(40), 1f);
        p2.setMargins(px(4), 0, 0, 0);
        presets.addView(chip("All theirs", v -> allTheirs()), p2);
        card.addView(presets, fill(40, 8));

        JSONArray people = PayInbox.choices(c).optJSONArray("people");
        if (people != null && people.length() > 0) {
            LinearLayout known = new LinearLayout(c);
            known.setOrientation(LinearLayout.HORIZONTAL);
            int n = Math.min(people.length(), 4);
            for (int k = 0; k < n; k++) {
                final String who = people.optString(k);
                if (who == null || who.isEmpty()) continue;
                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, px(36), 1f);
                p.setMargins(k == 0 ? 0 : px(3), 0, k == n - 1 ? 0 : px(3), 0);
                known.addView(chip("+ " + who, v -> addPerson(who)), p);
            }
            card.addView(known, fill(36, 8));
        }
        card.addView(link("+ Add another person", v -> {
            addRow("", false);
            equal();
        }), fill(36, 4));

        sum = text("", 14, MUTED, true);
        sum.setGravity(Gravity.CENTER);
        card.addView(sum, fill(-2, 6));
        card.addView(button("Save", true, v -> saveSplit()), fill(52, 8));
        card.addView(link("‹ Back", v -> showChoose()), fill(36, 2));
        equal();
        if (names.size() > 1) names.get(1).requestFocus();
    }

    private void addRow(String name, boolean me) {
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        EditText who = field(me ? "Me" : "Name");
        who.setText(name);
        if (me) {
            who.setEnabled(false);
            who.setTextColor(INK);
        }
        who.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS);
        LinearLayout.LayoutParams wp = new LinearLayout.LayoutParams(0, px(50), 1.6f);
        wp.setMargins(0, 0, px(6), 0);
        row.addView(who, wp);

        EditText share = field("₹0");
        share.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        share.setGravity(Gravity.CENTER);
        share.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int a, int b, int d) {
            }

            @Override
            public void onTextChanged(CharSequence s, int a, int b, int d) {
            }

            @Override
            public void afterTextChanged(Editable e) {
                tally();
            }
        });
        row.addView(share, new LinearLayout.LayoutParams(0, px(50), 1f));

        if (!me) {
            TextView x = text("✕", 18, MUTED, true);
            x.setGravity(Gravity.CENTER);
            x.setOnClickListener(v -> {
                int i = names.indexOf(who);
                if (i > 0) {
                    names.remove(i);
                    shares.remove(i);
                    rows.removeView(row);
                    equal();
                }
            });
            row.addView(x, new LinearLayout.LayoutParams(px(36), px(50)));
        } else {
            row.addView(new View(c), new LinearLayout.LayoutParams(px(36), px(50)));
        }
        names.add(who);
        shares.add(share);
        rows.addView(row, fill(50, names.size() == 1 ? 0 : 8));
    }

    private void addPerson(String who) {
        // Fill the first empty name before adding a row.
        for (int i = 1; i < names.size(); i++) {
            if (str(names.get(i)).isEmpty()) {
                names.get(i).setText(who);
                return;
            }
            if (str(names.get(i)).equalsIgnoreCase(who)) return;
        }
        addRow(who, false);
        equal();
    }

    private void equal() {
        int n = shares.size();
        if (n == 0) return;
        long paise = Math.round(amount * 100);
        long each = paise / n;
        long rest = paise - each * n;
        for (int i = 0; i < n; i++) {
            // Spare paise go to me, so the others' shares stay round.
            shares.get(i).setText(plain((each + (i == 0 ? rest : 0)) / 100.0));
        }
        tally();
    }

    private void allTheirs() {
        if (shares.size() < 2) addRow("", false);
        int others = shares.size() - 1;
        long paise = Math.round(amount * 100);
        long each = paise / others;
        long rest = paise - each * others;
        shares.get(0).setText("0");
        for (int i = 1; i < shares.size(); i++) shares.get(i).setText(plain((each + (i == 1 ? rest : 0)) / 100.0));
        tally();
    }

    private double total() {
        double t = 0;
        for (EditText s : shares) t += num(s);
        return Math.round(t * 100) / 100.0;
    }

    private void tally() {
        if (sum == null) return;
        double left = Math.round((amount - total()) * 100) / 100.0;
        if (Math.abs(left) < 0.005) {
            sum.setText("Adds up to " + money() + " ✓");
            sum.setTextColor(GREEN);
        } else if (left > 0) {
            sum.setText(PayNotifier.rupees(left) + " still to give to someone");
            sum.setTextColor(RED);
        } else {
            sum.setText(PayNotifier.rupees(-left) + " more than " + money());
            sum.setTextColor(RED);
        }
    }

    private void saveSplit() {
        if (Math.abs(amount - total()) >= 0.005) {
            tally();
            return;
        }
        JSONArray parts = new JSONArray();
        StringBuilder said = new StringBuilder();
        for (int i = 1; i < names.size(); i++) {
            double a = num(shares.get(i));
            if (a <= 0) continue;
            String who = str(names.get(i));
            if (who.isEmpty()) {
                names.get(i).setHint("Name?");
                names.get(i).requestFocus();
                sum.setText("Add a name for " + PayNotifier.rupees(a));
                sum.setTextColor(RED);
                return;
            }
            if (who.length() > 40) who = who.substring(0, 40);
            JSONObject p = new JSONObject();
            put(p, "person", who);
            put(p, "amount", a);
            parts.put(p);
            said.append(said.length() == 0 ? "" : ", ").append(who).append(" owes ").append(PayNotifier.rupees(a));
        }
        double mine = num(shares.get(0));
        if (parts.length() == 0) {
            save(answer("me"), money() + " saved as yours.");
            return;
        }
        JSONObject a = answer("split");
        put(a, "mine", mine);
        put(a, "parts", parts);
        save(a, said + (mine > 0 ? ". Your share " + PayNotifier.rupees(mine) + "." : "."));
    }

    // ---------------------------------------------------------------- saving

    private JSONObject answer(String who) {
        JSONObject a = new JSONObject();
        put(a, "who", who);
        put(a, "answeredAt", System.currentTimeMillis());
        return a;
    }

    private static void put(JSONObject o, String k, Object v) {
        try {
            o.put(k, v);
        } catch (JSONException ignored) {
            // keys are plain strings
        }
    }

    private void save(JSONObject a, String said) {
        PayInbox.answer(c, nid, amount, at, a);
        if (nid != 0) {
            try {
                NotificationManagerCompat.from(c).cancel(nid);
            } catch (RuntimeException ignored) {
            }
        }
        card.removeAllViews();
        card.addView(text("✓  " + said, 18, GREEN, true), fill(-2, 10));
        if (!"ignore".equals(a.optString("who"))) {
            card.addView(text("Saved. It shows up in Money next time you open DockIn.", 14, MUTED, false), fill(-2, 6));
        }
        handler.postDelayed(host::close, 1300);
    }

    // ---------------------------------------------------------------- views

    private void reset(String question) {
        card.removeAllViews();
        View grip = new View(c);
        grip.setBackground(round(EDGE, 0, 3));
        LinearLayout.LayoutParams g = new LinearLayout.LayoutParams(px(44), px(5));
        g.gravity = Gravity.CENTER_HORIZONTAL;
        g.setMargins(0, 0, 0, px(12));
        card.addView(grip, g);

        LinearLayout top = new LinearLayout(c);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        TextView badge = text("  PAID" + (source != null ? "  ·  " + source.toUpperCase(Locale.ROOT) : "") + "  ", 12, 0xFFFFFFFF, true);
        badge.setBackground(round(PURPLE, 0, 10));
        badge.setPadding(px(8), px(5), px(8), px(5));
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        top.addView(badge, bp);
        top.addView(new View(c), new LinearLayout.LayoutParams(0, px(1), 1f));
        TextView x = text("✕", 20, MUTED, true);
        x.setGravity(Gravity.CENTER);
        x.setOnClickListener(v -> host.close());
        top.addView(x, new LinearLayout.LayoutParams(px(40), px(40)));
        card.addView(top, fill(-2, 0));

        card.addView(text(money(), 40, INK, true), fill(-2, 6));
        if (merchant != null && !merchant.isEmpty()) {
            card.addView(text("to " + merchant, 17, INK, false), fill(-2, 0));
        }
        card.addView(text(question, 15, MUTED, true), fill(-2, 10));
        card.addView(new View(c), fill(6, 0));
    }

    private EditText field(String hint) {
        EditText e = new EditText(c);
        e.setHint(hint);
        e.setSingleLine(true);
        e.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        e.setTextColor(INK);
        e.setPadding(px(14), 0, px(14), 0);
        e.setBackground(round(0xFFFFFFFF, EDGE, 14));
        return e;
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
        put(o, "id", id);
        put(o, "label", label);
        put(o, "emoji", emoji);
        return o;
    }

    private static String str(EditText e) {
        return e.getText() == null ? "" : e.getText().toString().trim();
    }

    private static double num(EditText e) {
        try {
            double v = Double.parseDouble(str(e).replace(",", "").replace("₹", ""));
            return v > 0 ? Math.round(v * 100) / 100.0 : 0;
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private static String plain(double v) {
        if (v == Math.rint(v)) return String.valueOf((long) v);
        return String.format(Locale.US, "%.2f", v);
    }

    private int px(int v) {
        return Math.round(v * dp);
    }

    private String money() {
        return PayNotifier.rupees(amount);
    }
}
