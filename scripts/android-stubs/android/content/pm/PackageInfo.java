package android.content.pm;
public class PackageInfo {
  public String versionName;
  @Deprecated public int versionCode;
  public long getLongVersionCode() { return 0; }
}
