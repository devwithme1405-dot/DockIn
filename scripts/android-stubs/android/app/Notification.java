package android.app;
import android.os.Bundle;
public class Notification {
  public static final String EXTRA_TITLE = "a";
  public static final String EXTRA_TEXT = "b";
  public static final String EXTRA_BIG_TEXT = "c";
  public static final int FLAG_ONGOING_EVENT = 2;
  public int flags;
  public Bundle extras;
}
