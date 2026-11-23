// A working JSONArray for the JVM tests only (the one in android-stubs answers nothing).
package org.json;
public class JSONArray {
  private final java.util.ArrayList<Object> l = new java.util.ArrayList<>();
  public JSONArray() {}
  public JSONArray(String s) throws JSONException {}
  public int length() { return l.size(); }
  public JSONArray put(Object v) { l.add(v); return this; }
  public JSONArray put(boolean v) { l.add(v); return this; }
  public JSONArray put(long v) { l.add(v); return this; }
  public Object remove(int i) { return i < l.size() ? l.remove(i) : null; }
  public Object opt(int i) { return i < l.size() ? l.get(i) : null; }
  public JSONObject optJSONObject(int i) { Object v = opt(i); return v instanceof JSONObject ? (JSONObject) v : null; }
  public String optString(int i) { Object v = opt(i); return v == null ? "" : String.valueOf(v); }
  public JSONObject getJSONObject(int i) throws JSONException { return optJSONObject(i); }
  public String getString(int i) throws JSONException { return optString(i); }
  public String toString() { return ""; }
}
