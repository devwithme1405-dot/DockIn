package com.getcapacitor;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
public class BridgeWebViewClient extends android.webkit.WebViewClient {
  public BridgeWebViewClient(Bridge b) {}
  public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) { return null; }
  @Override public void onReceivedError(WebView v, WebResourceRequest r, android.webkit.WebResourceError e) {}
}
