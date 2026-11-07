package androidx.core.app;
import android.app.Notification;
import android.content.Context;
import java.util.Set;
public final class NotificationManagerCompat {
  public static final int IMPORTANCE_HIGH = 4;
  public static final int IMPORTANCE_DEFAULT = 3;
  public static NotificationManagerCompat from(Context c) { return null; }
  public static Set<String> getEnabledListenerPackages(Context c) { return null; }
  public boolean areNotificationsEnabled() { return false; }
  public void notify(int id, Notification n) {}
  public void createNotificationChannel(NotificationChannelCompat channel) {}
}
