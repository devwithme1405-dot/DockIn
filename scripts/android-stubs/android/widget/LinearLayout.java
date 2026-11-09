package android.widget;
import android.view.ViewGroup;
public class LinearLayout extends ViewGroup {
  public static final int HORIZONTAL = 0;
  public static final int VERTICAL = 1;
  public LinearLayout(android.content.Context c) { super(c); }
  public void setOrientation(int o) {}
  public void setGravity(int g) {}
  public void setClickable(boolean c) {}
  public static class LayoutParams extends ViewGroup.MarginLayoutParams {
    public int gravity;
    public LayoutParams(int w, int h) { super(w, h); }
    public LayoutParams(int w, int h, float weight) { super(w, h); }
  }
}
