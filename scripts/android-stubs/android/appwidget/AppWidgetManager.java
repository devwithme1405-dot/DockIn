package android.appwidget;
public class AppWidgetManager {
  public static final String ACTION_APPWIDGET_UPDATE = "android.appwidget.action.APPWIDGET_UPDATE";
  public static final String EXTRA_APPWIDGET_IDS = "appWidgetIds";
  public static AppWidgetManager getInstance(android.content.Context c) { return null; }
  public int[] getAppWidgetIds(android.content.ComponentName n) { return null; }
  public void updateAppWidget(int id, android.widget.RemoteViews v) {}
}
