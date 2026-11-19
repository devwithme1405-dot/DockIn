package android.webkit;
public interface WebResourceRequest {
  android.net.Uri getUrl();
  boolean isForMainFrame();
  String getMethod();
  java.util.Map<String, String> getRequestHeaders();
}
