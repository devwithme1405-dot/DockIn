package android.content.pm;
public class PackageInfo {
  public String versionName;
  public String packageName;
  public SigningInfo signingInfo;
  @Deprecated public Signature[] signatures;
  @Deprecated public int versionCode;
  public long getLongVersionCode() { return 0; }
}
