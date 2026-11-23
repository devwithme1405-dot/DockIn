package android.graphics;
public class Paint {
  public static final int ANTI_ALIAS_FLAG = 1;
  public enum Style { STROKE, FILL }
  public enum Cap { ROUND }
  public enum Align { CENTER }
  public static class FontMetrics { public float ascent, descent; }
  public Paint() {}
  public Paint(int f) {}
  public void setStyle(Style s) {}
  public void setStrokeWidth(float w) {}
  public void setStrokeCap(Cap c) {}
  public void setColor(int c) {}
  public void setTextAlign(Align a) {}
  public Typeface setTypeface(Typeface t) { return t; }
  public void setTextSize(float s) {}
  public Shader setShader(Shader s) { return s; }
  public FontMetrics getFontMetrics() { return new FontMetrics(); }
}
