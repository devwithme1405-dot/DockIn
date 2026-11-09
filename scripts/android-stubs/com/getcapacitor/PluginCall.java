package com.getcapacitor;
public class PluginCall {
  public void resolve(JSObject data) {}
  public void resolve() {}
  public void reject(String msg) {}
  public JSArray getArray(String name) { return null; }
  public String getString(String name) { return null; }
  public Boolean getBoolean(String name, Boolean def) { return def; }
  public JSObject getData() { return null; }
}
