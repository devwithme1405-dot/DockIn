package androidx.core.app;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
public class NotificationCompat {
  public static final String CATEGORY_REMINDER = "reminder";
  public static final int PRIORITY_HIGH = 1;
  public static final int PRIORITY_DEFAULT = 0;
  public static abstract class Style {}
  public static class BigTextStyle extends Style { public BigTextStyle bigText(CharSequence t) { return this; } }
  public static class Builder {
    public Builder(Context c, String channelId) {}
    public Builder setSmallIcon(int icon) { return this; }
    public Builder setColor(int argb) { return this; }
    public Builder setContentTitle(CharSequence t) { return this; }
    public Builder setContentText(CharSequence t) { return this; }
    public Builder setAutoCancel(boolean b) { return this; }
    public Builder setContentIntent(PendingIntent i) { return this; }
    public Builder setCategory(String c) { return this; }
    public Builder setPriority(int p) { return this; }
    public Builder setWhen(long w) { return this; }
    public Builder setShowWhen(boolean b) { return this; }
    public Builder addAction(int icon, CharSequence title, PendingIntent i) { return this; }
    public Builder setStyle(Style s) { return this; }
    public Builder setOngoing(boolean b) { return this; }
    public Builder setDefaults(int d) { return this; }
    public Notification build() { return null; }
  }
  public static final int PRIORITY_MAX = 2;
  public static final int PRIORITY_MIN = -2;
  public static final int DEFAULT_ALL = -1;
}
