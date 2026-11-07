package com.getcapacitor;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
public class JSArray extends JSONArray {
  public JSArray() {}
  public JSArray(String json) throws JSONException {}
  public <E> List<E> toList() throws JSONException { return null; }
}
