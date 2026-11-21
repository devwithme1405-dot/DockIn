package android.content.pm;
public abstract class PackageManager {
  public abstract PackageInfo getPackageInfo(String p, int f) throws NameNotFoundException;
  public static class NameNotFoundException extends Exception {}
  public static final int PERMISSION_GRANTED = 0;
  public boolean canRequestPackageInstalls() { return true; }
  public static final int GET_SIGNATURES = 64;
  public static final int GET_SIGNING_CERTIFICATES = 134217728;
  public PackageInfo getPackageArchiveInfo(String path, int flags) { return null; }
  public PackageInstaller getPackageInstaller() { return null; }
}
