package android.view;
public class ViewGroup extends View {
  public ViewGroup(android.content.Context c) { super(c); }
  public static class LayoutParams {
    public static final int MATCH_PARENT = -1;
    public static final int WRAP_CONTENT = -2;
    public LayoutParams(int w, int h) {}
  }
  public static class MarginLayoutParams extends LayoutParams {
    public MarginLayoutParams(int w, int h) { super(w, h); }
    public void setMargins(int l, int t, int r, int b) {}
  }
  public void addView(View v) {}
  public void addView(View v, LayoutParams p) {}
  public void removeView(View v) {}
  public void removeAllViews() {}
}
