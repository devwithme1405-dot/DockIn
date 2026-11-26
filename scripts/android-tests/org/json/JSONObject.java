// A working JSONObject for the JVM tests only (the one in android-stubs answers nothing).
package org.json;
import java.util.Iterator;
public class JSONObject {
  private final java.util.HashMap<String,Object> m = new java.util.HashMap<>();
  public static final Object NULL = new Object();
  public JSONObject() {}
  public JSONObject(String s) throws JSONException {}
  public JSONObject put(String k, Object v) throws JSONException { m.put(k, v); return this; }
  public JSONObject put(String k, long v) throws JSONException { m.put(k, v); return this; }
  public JSONObject put(String k, int v) throws JSONException { m.put(k, v); return this; }
  public JSONObject put(String k, boolean v) throws JSONException { m.put(k, v); return this; }
  public JSONObject put(String k, double v) throws JSONException { m.put(k, v); return this; }
  public Object opt(String k) { return m.get(k); }
  public boolean has(String k) { return m.containsKey(k); }
  public boolean isNull(String k) { return true; }
  public Object remove(String k) { return null; }
  public Iterator<String> keys() { return m.keySet().iterator(); }
  public int length() { return m.size(); }
  public String optString(String k) { return optString(k, ""); }
  public String optString(String k, String d) { Object v = m.get(k); return v == null ? d : String.valueOf(v); }
  public boolean optBoolean(String k) { return optBoolean(k, false); }
  public boolean optBoolean(String k, boolean d) { Object v = m.get(k); return v instanceof Boolean ? (Boolean) v : d; }
  public int optInt(String k) { return 0; }
  public int optInt(String k, int d) { return d; }
  public long optLong(String k) { return optLong(k, 0); }
  public long optLong(String k, long d) { Object v = m.get(k); return v instanceof Number ? ((Number) v).longValue() : d; }
  public double optDouble(String k) { return 0; }
  public double optDouble(String k, double d) { return d; }
  public JSONArray optJSONArray(String k) { Object v = m.get(k); return v instanceof JSONArray ? (JSONArray) v : null; }
  public JSONObject optJSONObject(String k) { Object v = m.get(k); return v instanceof JSONObject ? (JSONObject) v : null; }
  public JSONObject getJSONObject(String k) throws JSONException { return null; }
  public JSONArray getJSONArray(String k) throws JSONException { return null; }
  public String getString(String k) throws JSONException { return null; }
  public String toString() { return ""; }
}
