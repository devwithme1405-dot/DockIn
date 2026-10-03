package com.dockin.app;

/**
 * Stand-in for the R class aapt generates at build time, so javac can typecheck
 * the sources here without the Android SDK. Every string the app refers to needs
 * a line, which also means a name that does not exist in strings.xml is caught
 * here rather than by a build somewhere else.
 */
public final class R {
  public static final class string {
    public static final int app_name = 1;
    public static final int asset_statements = 2;
    public static final int pay_watch_label = 3;
    public static final int pay_turn_on = 4;
    public static final int pay_turn_on_manual = 5;
  }
}
