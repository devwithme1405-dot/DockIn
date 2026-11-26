package android.webkit;
public class WebViewClient {
  public void onPageFinished(WebView v, String url) {}
  public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return false; }
  public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {}
  public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return null; }
}
