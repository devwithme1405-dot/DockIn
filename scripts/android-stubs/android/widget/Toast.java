package android.widget;
import android.content.Context;
public class Toast {
  public static final int LENGTH_LONG = 1;
  public static Toast makeText(Context c, int resId, int dur) { return new Toast(); }
  public static Toast makeText(Context c, CharSequence t, int dur) { return new Toast(); }
  public void show() {}
}
