package android.content.pm;
public abstract class PackageManager {
  public abstract PackageInfo getPackageInfo(String p, int f) throws NameNotFoundException;
  public static class NameNotFoundException extends Exception {}
  public static final int PERMISSION_GRANTED = 0;
}
