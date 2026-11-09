package android.view;
public class View {
  public static final int GONE = 8;
  public static final int VISIBLE = 0;
  public static final int INVISIBLE = 4;
  public View(android.content.Context c) {}
  public interface OnClickListener { void onClick(View v); }
  public interface OnApplyWindowInsetsListener { WindowInsets onApplyWindowInsets(View v, WindowInsets insets); }
  public void setOnClickListener(OnClickListener l) {}
  public void setOnApplyWindowInsetsListener(OnApplyWindowInsetsListener l) {}
  public void setPadding(int l, int t, int r, int b) {}
  public void setBackgroundColor(int c) {}
  public void setVisibility(int v) {}
  public void setClickable(boolean c) {}
  public void bringToFront() {}
  public void setBackground(android.graphics.drawable.Drawable d) {}
  public void setPadding2() {}
  public void setTranslationY(float y) {}
  public android.view.ViewPropertyAnimator animate() { return null; }
  public boolean requestFocus() { return true; }
  public View findFocus() { return null; }
  public boolean dispatchKeyEvent(KeyEvent e) { return false; }
}
