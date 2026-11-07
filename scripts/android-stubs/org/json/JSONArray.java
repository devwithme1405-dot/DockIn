package org.json;
public class JSONArray {
  public JSONArray() {}
  public JSONArray(String s) throws JSONException {}
  public int length() { return 0; }
  public JSONArray put(Object v) { return this; }
  public JSONArray put(boolean v) { return this; }
  public JSONArray put(long v) { return this; }
  public Object remove(int i) { return null; }
  public Object opt(int i) { return null; }
  public JSONObject optJSONObject(int i) { return null; }
  public String optString(int i) { return ""; }
  public JSONObject getJSONObject(int i) throws JSONException { return null; }
  public String getString(int i) throws JSONException { return null; }
  public String toString() { return ""; }
}
