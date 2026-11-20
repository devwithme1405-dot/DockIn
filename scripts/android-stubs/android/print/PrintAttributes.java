package android.print;
public final class PrintAttributes {
  public static final class MediaSize { public static final MediaSize ISO_A4 = new MediaSize(); }
  public static final class Resolution { public Resolution(String id, String label, int h, int v) {} }
  public static final class Margins { public static final Margins NO_MARGINS = new Margins(); }
  public static final class Builder {
    public Builder setMediaSize(MediaSize m) { return this; }
    public Builder setResolution(Resolution r) { return this; }
    public Builder setMinMargins(Margins m) { return this; }
    public PrintAttributes build() { return new PrintAttributes(); }
  }
}
