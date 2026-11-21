package android.content.pm;
import android.content.IntentSender;
import java.io.IOException;
import java.io.OutputStream;
import java.util.List;
public class PackageInstaller {
  public static final String EXTRA_STATUS = "android.content.pm.extra.STATUS";
  public static final String EXTRA_STATUS_MESSAGE = "android.content.pm.extra.STATUS_MESSAGE";
  public static final int STATUS_PENDING_USER_ACTION = -1;
  public static final int STATUS_SUCCESS = 0;
  public static final int STATUS_FAILURE = 1;
  public static final int STATUS_FAILURE_BLOCKED = 2;
  public static final int STATUS_FAILURE_ABORTED = 3;
  public static final int STATUS_FAILURE_INVALID = 4;
  public static final int STATUS_FAILURE_CONFLICT = 5;
  public static final int STATUS_FAILURE_STORAGE = 6;
  public static final int STATUS_FAILURE_INCOMPATIBLE = 7;
  public int createSession(SessionParams p) throws IOException { return 0; }
  public Session openSession(int id) throws IOException { return null; }
  public void abandonSession(int id) {}
  public List<SessionInfo> getMySessions() { return null; }
  public static class SessionInfo { public int getSessionId() { return 0; } }
  public static class SessionParams {
    public static final int MODE_FULL_INSTALL = 1;
    public static final int USER_ACTION_NOT_REQUIRED = 2;
    public SessionParams(int mode) {}
    public void setAppPackageName(String p) {}
    public void setSize(long s) {}
    public void setRequireUserAction(int r) {}
  }
  public static class Session implements java.io.Closeable {
    public OutputStream openWrite(String name, long offset, long length) throws IOException { return null; }
    public void fsync(OutputStream out) throws IOException {}
    public void commit(IntentSender s) {}
    public void abandon() {}
    public void close() {}
  }
}
