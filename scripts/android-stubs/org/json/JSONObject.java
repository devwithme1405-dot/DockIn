package org.json;
import java.util.Iterator;
public class JSONObject {
  public JSONObject() {}
  public JSONObject(String s) throws JSONException {}
  public JSONObject put(String k, Object v) throws JSONException { return this; }
  public JSONObject put(String k, long v) throws JSONException { return this; }
  public JSONObject put(String k, int v) throws JSONException { return this; }
  public JSONObject put(String k, boolean v) throws JSONException { return this; }
  public JSONObject put(String k, double v) throws JSONException { return this; }
  public Object opt(String k) { return null; }
  public boolean has(String k) { return false; }
  public Object remove(String k) { return null; }
  public Iterator<String> keys() { return null; }
  public int length() { return 0; }
  public String optString(String k) { return ""; }
  public String optString(String k, String d) { return d; }
  public boolean optBoolean(String k) { return false; }
  public boolean optBoolean(String k, boolean d) { return d; }
  public int optInt(String k) { return 0; }
  public int optInt(String k, int d) { return d; }
  public long optLong(String k) { return 0; }
  public long optLong(String k, long d) { return d; }
  public double optDouble(String k) { return 0; }
  public double optDouble(String k, double d) { return d; }
  public JSONArray optJSONArray(String k) { return null; }
  public JSONObject optJSONObject(String k) { return null; }
  public JSONObject getJSONObject(String k) throws JSONException { return null; }
  public JSONArray getJSONArray(String k) throws JSONException { return null; }
  public String getString(String k) throws JSONException { return null; }
  public String toString() { return ""; }
}
