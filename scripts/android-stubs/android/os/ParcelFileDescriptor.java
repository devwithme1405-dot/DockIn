package android.os;
public class ParcelFileDescriptor implements java.io.Closeable {
  public static final int MODE_READ_WRITE = 0x30000000;
  public static final int MODE_CREATE = 0x08000000;
  public static final int MODE_TRUNCATE = 0x04000000;
  public static ParcelFileDescriptor open(java.io.File f, int mode) throws java.io.FileNotFoundException { return null; }
  public void close() throws java.io.IOException {}
}
