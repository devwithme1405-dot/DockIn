package android.content;
import android.net.Uri;
public class Intent {
  public static final int FLAG_ACTIVITY_NEW_TASK = 1;
  public Intent() {}
  public Intent(String action) {}
  public Intent addFlags(int f) { return this; }
  public Uri getData() { return null; }
  public Intent setData(Uri d) { return this; }
}
