package android.service.notification;
import android.content.Context;
public class NotificationListenerService extends Context {
  public void onListenerConnected() {}
  public void onNotificationPosted(StatusBarNotification sbn) {}
  public void onListenerDisconnected() {}
  public static void requestRebind(android.content.ComponentName c) {}
}
