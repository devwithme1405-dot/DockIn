package android.app;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
public class Activity extends Context {
  protected void onCreate(Bundle b) {}
  public Intent getIntent() { return null; }
  public void finish() {}
  public boolean moveTaskToBack(boolean nonRoot) { return true; }
  public void setContentView(android.view.View v) {}
  public void onBackPressed() {}
  protected void onDestroy() {}
  public android.content.res.Resources getResources() { return null; }
}
