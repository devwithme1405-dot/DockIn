package android.content;
public class Context {
  public static final int MODE_PRIVATE = 0;
  public static final String JOB_SCHEDULER_SERVICE = "jobscheduler";
  public Object getSystemService(String name) { return null; }
  public Context getApplicationContext() { return this; }
  public SharedPreferences getSharedPreferences(String n, int m) { return null; }
  public String getString(int id) { return null; }
  public void startActivity(Intent i) {}
  public android.content.pm.PackageManager getPackageManager() { return null; }
  public String getPackageName() { return null; }
  public ContentResolver getContentResolver() { return null; }
}
