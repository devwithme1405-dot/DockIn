package android.webkit;
public class WebViewClient {
  public void onPageFinished(WebView v, String url) {}
  public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {}
  public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return null; }
}
