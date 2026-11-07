package android.app;
import android.os.Bundle;
public class Notification {
  public static final String EXTRA_TITLE = "android.title";
  public static final String EXTRA_TEXT = "android.text";
  public static final String EXTRA_BIG_TEXT = "android.bigText";
  public static final int FLAG_ONGOING_EVENT = 2;
  public static final int FLAG_GROUP_SUMMARY = 512;
  public int flags;
  public Bundle extras;
}
