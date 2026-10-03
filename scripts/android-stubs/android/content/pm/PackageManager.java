package android.content.pm;
public class PackageManager {
  public static final int GET_META_DATA = 128;
  public PackageInfo getPackageInfo(String p, int f) throws NameNotFoundException { return new PackageInfo(); }
  public ActivityInfo getActivityInfo(android.content.ComponentName c, int f) throws NameNotFoundException { return new ActivityInfo(); }
  public static class NameNotFoundException extends Exception {}
}
