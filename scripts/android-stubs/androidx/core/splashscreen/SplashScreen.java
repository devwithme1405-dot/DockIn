package androidx.core.splashscreen;

import android.app.Activity;

/** Just enough of androidx.core.splashscreen for javac to typecheck MainActivity. */
public class SplashScreen {
  public static SplashScreen installSplashScreen(Activity activity) {
    return new SplashScreen();
  }

  public interface KeepOnScreenCondition {
    boolean shouldKeepOnScreen();
  }

  public void setKeepOnScreenCondition(KeepOnScreenCondition condition) {}
}
