package android.widget;
public class RemoteViews {
  public RemoteViews(String pkg, int layout) {}
  public void setTextViewText(int id, CharSequence t) {}
  public void setTextColor(int id, int c) {}
  public void setViewVisibility(int id, int v) {}
  public void setOnClickPendingIntent(int id, android.app.PendingIntent p) {}
  public void setImageViewBitmap(int id, android.graphics.Bitmap b) {}
  public void setInt(int id, String method, int v) {}
  public void setProgressBar(int id, int max, int progress, boolean indeterminate) {}
  public void setImageViewResource(int id, int res) {}
}
