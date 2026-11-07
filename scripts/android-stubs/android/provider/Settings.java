package android.provider;
import android.content.ContentResolver;
public final class Settings {
  public static final String ACTION_NOTIFICATION_LISTENER_SETTINGS = "a";
  public static final String ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS = "b";
  public static final String EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME = "c";
  public static final String ACTION_APPLICATION_DETAILS_SETTINGS = "d";
  public static final String ACTION_APP_NOTIFICATION_SETTINGS = "e";
  public static final String EXTRA_APP_PACKAGE = "f";
  public static final class Secure {
    public static String getString(ContentResolver cr, String name) { return null; }
  }
}
