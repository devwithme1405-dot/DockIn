package android.app;
public class Service extends android.content.Context {
  public static final int START_STICKY = 1;
  public static final int START_NOT_STICKY = 2;
  public int onStartCommand(android.content.Intent i, int flags, int startId) { return 0; }
  public void onDestroy() {}
  public void onTaskRemoved(android.content.Intent i) {}
  public boolean onUnbind(android.content.Intent i) { return false; }
  public android.os.IBinder onBind(android.content.Intent i) { return null; }
  public final void startForeground(int id, Notification n) {}
  public final void startForeground(int id, Notification n, int type) {}
  public final void stopSelf() {}
}
