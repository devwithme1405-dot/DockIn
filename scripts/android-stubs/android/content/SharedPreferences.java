package android.content;
public interface SharedPreferences {
  String getString(String k, String d);
  long getLong(String k, long d);
  int getInt(String k, int d);
  Editor edit();
  interface Editor {
    Editor putString(String k, String v);
    Editor putLong(String k, long v);
    Editor putInt(String k, int v);
    Editor remove(String k);
    Editor clear();
    void apply();
  }
}
