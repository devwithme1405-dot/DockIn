package com.dockin.student;

import android.content.Context;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.view.inputmethod.InputMethodManager;
import android.widget.FrameLayout;

/**
 * The payment sheet floating over whatever app is open — GPay's success screen,
 * Instagram, the home screen — with DockIn itself closed.
 *
 * It is a window drawn on top (the "Display over other apps" permission), not a
 * screen that has to be launched: Android 10+ and MIUI block apps from opening
 * screens from the background, but an overlay is exactly what that permission
 * exists for. Without the permission, the notification opens the same sheet.
 */
final class PayPopup {

    private static View shown;
    private static WindowManager.LayoutParams params;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private PayPopup() {}

    static boolean allowed(Context c) {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c);
    }

    /** Shows the sheet now. Returns false when it cannot (no permission). */
    static boolean show(Context ctx, double amount, String merchant, String source, long at, int nid) {
        final Context c = ctx.getApplicationContext();
        if (!allowed(c)) return false;
        MAIN.post(() -> {
            try {
                final WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
                if (wm == null) return;
                remove(wm);
                int type = Build.VERSION.SDK_INT >= 26
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;
                final WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.MATCH_PARENT,
                        WindowManager.LayoutParams.MATCH_PARENT,
                        type,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                        PixelFormat.TRANSLUCENT);
                lp.gravity = Gravity.BOTTOM;
                lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE;

                final FrameLayout frame = new FrameLayout(c) {
                    @Override
                    public boolean dispatchKeyEvent(KeyEvent e) {
                        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK && e.getAction() == KeyEvent.ACTION_UP) {
                            remove(wm);
                            return true;
                        }
                        return super.dispatchKeyEvent(e);
                    }
                };
                PayAskUi ui = new PayAskUi(c, amount, merchant, source, at, nid, null, new PayAskUi.Host() {
                    @Override
                    public void close() {
                        MAIN.post(() -> remove(wm));
                    }

                    @Override
                    public void keyboard(boolean on) {
                        if (shown == null || params == null) return;
                        if (on) params.flags &= ~WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                        else params.flags |= WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE;
                        try {
                            wm.updateViewLayout(shown, params);
                        } catch (RuntimeException ignored) {
                        }
                        if (on) {
                            MAIN.postDelayed(() -> {
                                InputMethodManager im = (InputMethodManager) c.getSystemService(Context.INPUT_METHOD_SERVICE);
                                View f = shown == null ? null : shown.findFocus();
                                if (im != null && f != null) im.showSoftInput(f, 0);
                            }, 150);
                        }
                    }
                });
                frame.addView(ui.root(), new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                wm.addView(frame, lp);
                shown = frame;
                params = lp;
                // Not left on screen forever if the phone is put down.
                final View mine = frame;
                MAIN.postDelayed(() -> {
                    if (shown == mine) remove(wm);
                }, 3 * 60_000L);
            } catch (RuntimeException e) {
                // The system refused the window (permission revoked a moment ago,
                // a vendor quirk). The notification is still there to tap.
                shown = null;
                params = null;
            }
        });
        return true;
    }

    /** Takes the floating sheet away, if one is showing. */
    static void dismiss(Context ctx) {
        final Context c = ctx.getApplicationContext();
        MAIN.post(() -> {
            WindowManager wm = (WindowManager) c.getSystemService(Context.WINDOW_SERVICE);
            if (wm != null) remove(wm);
        });
    }

    private static void remove(WindowManager wm) {
        if (shown == null) return;
        try {
            wm.removeView(shown);
        } catch (RuntimeException ignored) {
        }
        shown = null;
        params = null;
    }
}
