package android.content;
import java.util.Set;
public interface SharedPreferences {
  String getString(String k, String d);
  long getLong(String k, long d);
  int getInt(String k, int d);
  boolean getBoolean(String k, boolean d);
  Set<String> getStringSet(String k, Set<String> d);
  boolean contains(String k);
  Editor edit();
  interface Editor {
    Editor putString(String k, String v);
    Editor putLong(String k, long v);
    Editor putInt(String k, int v);
    Editor putBoolean(String k, boolean v);
    Editor putStringSet(String k, Set<String> v);
    Editor remove(String k);
    Editor clear();
    void apply();
    boolean commit();
  }
}
