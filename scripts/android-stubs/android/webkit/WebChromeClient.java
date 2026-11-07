package android.webkit;
public class WebChromeClient {
  public boolean onCreateWindow(WebView v, boolean isDialog, boolean isUserGesture, android.os.Message m) { return false; }
  public void onCloseWindow(WebView w) {}
}
