package android.view;
public class View {
  public View(android.content.Context c) {}
  public interface OnClickListener { void onClick(View v); }
  public interface OnApplyWindowInsetsListener { WindowInsets onApplyWindowInsets(View v, WindowInsets insets); }
  public void setOnClickListener(OnClickListener l) {}
  public void setOnApplyWindowInsetsListener(OnApplyWindowInsetsListener l) {}
  public void setPadding(int l, int t, int r, int b) {}
  public void setBackgroundColor(int c) {}
}
