package android.net;
public class Uri {
  public String getPath() { return null; }
  public String getHost() { return null; }
  public String getQueryParameter(String k) { return null; }
  public Builder buildUpon() { return new Builder(); }
  public static Uri parse(String s) { return new Uri(); }
  public static class Builder {
    public Builder appendQueryParameter(String k, String v) { return this; }
    public Uri build() { return new Uri(); }
  }
}
