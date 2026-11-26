package android.webkit;
public class WebChromeClient {
  public boolean onCreateWindow(WebView v, boolean isDialog, boolean isUserGesture, android.os.Message m) { return false; }
  public void onCloseWindow(WebView w) {}
  public boolean onShowFileChooser(WebView v, ValueCallback<android.net.Uri[]> c, FileChooserParams p) { return false; }
  public abstract static class FileChooserParams {
    public abstract android.content.Intent createIntent();
    public static android.net.Uri[] parseResult(int resultCode, android.content.Intent data) { return null; }
  }
}
