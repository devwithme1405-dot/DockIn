package android.provider;
import android.content.ContentResolver;
public class Settings {
  public static final String ACTION_NOTIFICATION_LISTENER_SETTINGS = "x";
  public static class Secure {
    public static String getString(ContentResolver cr, String name) { return null; }
  }
}
