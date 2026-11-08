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
}
