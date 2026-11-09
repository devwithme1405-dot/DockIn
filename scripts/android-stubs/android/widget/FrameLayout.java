package android.widget;
import android.view.ViewGroup;
public class FrameLayout extends ViewGroup {
  public FrameLayout(android.content.Context c) { super(c); }
  public static class LayoutParams extends ViewGroup.MarginLayoutParams { public LayoutParams(int w, int h) { super(w, h); } public LayoutParams(int w, int h, int gravity) { super(w, h); } }
}
