package android.app;
import android.app.PendingIntent;
public class AlarmManager {
  public static final int RTC_WAKEUP = 0;
  public static final int ELAPSED_REALTIME_WAKEUP = 2;
  public void setAndAllowWhileIdle(int type, long at, PendingIntent op) {}
  public void setWindow(int type, long windowStart, long windowLength, PendingIntent op) {}
  public void cancel(PendingIntent op) {}
}
