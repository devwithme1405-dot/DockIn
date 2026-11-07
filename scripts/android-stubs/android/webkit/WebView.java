package android.webkit;
import android.view.View;
public class WebView extends View {
  public WebView(android.content.Context c) { super(c); }
  public class WebViewTransport { public void setWebView(WebView w) {} }
  public boolean canGoBack() { return false; }
  public void goBack() {}
  public WebSettings getSettings() { return null; }
  public void loadUrl(String url) {}
  public void evaluateJavascript(String js, ValueCallback<String> cb) {}
  public void setWebViewClient(WebViewClient c) {}
  public void setWebChromeClient(WebChromeClient c) {}
  public void destroy() {}
}
