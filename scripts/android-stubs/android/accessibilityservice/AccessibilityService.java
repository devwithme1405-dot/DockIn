package android.accessibilityservice;
public abstract class AccessibilityService extends android.app.Service {
  protected void onServiceConnected() {}
  public abstract void onAccessibilityEvent(android.view.accessibility.AccessibilityEvent e);
  public abstract void onInterrupt();
  public android.view.accessibility.AccessibilityNodeInfo getRootInActiveWindow() { return null; }
}
