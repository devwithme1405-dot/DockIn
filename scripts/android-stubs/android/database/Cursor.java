package android.database;
public interface Cursor extends java.io.Closeable {
  boolean moveToFirst();
  int getColumnIndex(String c);
  String getString(int i);
  long getLong(int i);
  boolean isNull(int i);
  void close();
}
