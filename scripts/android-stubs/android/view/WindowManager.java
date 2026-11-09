package android.view;
public interface WindowManager {
  void addView(View v, ViewGroup.LayoutParams p);
  void updateViewLayout(View v, ViewGroup.LayoutParams p);
  void removeView(View v);
  class LayoutParams extends ViewGroup.LayoutParams {
    public static final int TYPE_APPLICATION_OVERLAY = 2038;
    public static final int TYPE_PHONE = 2002;
    public static final int FLAG_NOT_FOCUSABLE = 8;
    public static final int FLAG_LAYOUT_IN_SCREEN = 256;
    public static final int SOFT_INPUT_ADJUST_RESIZE = 16;
    public int flags; public int gravity; public int softInputMode; public float dimAmount;
    public LayoutParams(int w, int h, int type, int flags, int format) { super(w, h); }
  }
}
