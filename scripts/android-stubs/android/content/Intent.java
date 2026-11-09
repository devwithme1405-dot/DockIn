package android.content;
import android.net.Uri;
public class Intent {
  public static final int FLAG_ACTIVITY_NEW_TASK = 0x10000000;
  public static final int FLAG_ACTIVITY_SINGLE_TOP = 0x20000000;
  public Intent() {}
  public Intent(String action) {}
  public Intent(String action, Uri uri) {}
  public Intent(Context c, Class<?> cls) {}
  public Intent addFlags(int f) { return this; }
  public Intent putExtra(String k, String v) { return this; }
  public Intent putExtra(String k, boolean v) { return this; }
  public Intent putExtra(String k, int v) { return this; }
  public Intent setAction(String a) { return this; }
  public int getIntExtra(String k, int d) { return d; }
  public boolean getBooleanExtra(String k, boolean d) { return d; }
  public String getStringExtra(String k) { return null; }
  public void removeExtra(String k) {}
  public Intent putExtra(String k, double v) { return this; }
  public Intent putExtra(String k, long v) { return this; }
  public double getDoubleExtra(String k, double d) { return d; }
  public long getLongExtra(String k, long d) { return d; }
  public static final int FLAG_ACTIVITY_CLEAR_TASK = 32768;
  public static final int FLAG_ACTIVITY_NO_ANIMATION = 65536;
  public static final String ACTION_BOOT_COMPLETED = "android.intent.action.BOOT_COMPLETED";
  public static final String ACTION_MY_PACKAGE_REPLACED = "android.intent.action.MY_PACKAGE_REPLACED";
  public String getAction() { return null; }
  public Intent setClassName(String p, String c) { return this; }
  public Intent setComponent(android.content.ComponentName c) { return this; }
}
