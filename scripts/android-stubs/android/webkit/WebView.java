package android.webkit;
import android.view.View;
public class WebView extends View {
  public WebView(android.content.Context c) { super(c); }
  public class WebViewTransport { public void setWebView(WebView w) {} }
  public boolean canGoBack() { return false; }
  public void goBack() {}
  public android.os.Bundle saveState(android.os.Bundle b) { return null; }
  public android.os.Bundle restoreState(android.os.Bundle b) { return null; }
  public void setBackgroundColor(int c) {}
  public WebSettings getSettings() { return null; }
  public void loadUrl(String url) {}
  public void loadDataWithBaseURL(String baseUrl, String data, String mimeType, String encoding, String historyUrl) {}
  public void evaluateJavascript(String js, ValueCallback<String> cb) {}
  public void addJavascriptInterface(Object o, String name) {}
  public void setWebViewClient(WebViewClient c) {}
  public void setWebChromeClient(WebChromeClient c) {}
  public void destroy() {}
  public android.print.PrintDocumentAdapter createPrintDocumentAdapter(String name) { return null; }
}
