package android.app.job;
import android.content.ComponentName;
public class JobInfo {
  public static final int NETWORK_TYPE_ANY = 1;
  public static class Builder {
    public Builder(int id, ComponentName c) {}
    public Builder setRequiredNetworkType(int t) { return this; }
    public Builder setPeriodic(long ms) { return this; }
    public Builder setPersisted(boolean b) { return this; }
    public JobInfo build() { return null; }
  }
}
