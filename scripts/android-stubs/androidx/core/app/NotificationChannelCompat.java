package androidx.core.app;
public class NotificationChannelCompat {
  public static class Builder {
    public Builder(String id, int importance) {}
    public Builder setName(CharSequence name) { return this; }
    public Builder setDescription(String d) { return this; }
    public Builder setVibrationEnabled(boolean v) { return this; }
    public Builder setShowBadge(boolean v) { return this; }
    public NotificationChannelCompat build() { return null; }
  }
}
