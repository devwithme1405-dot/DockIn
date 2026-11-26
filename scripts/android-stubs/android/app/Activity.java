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
  public void setContentView(int layout) {}
  public <T extends android.view.View> T findViewById(int id) { return null; }
  public android.view.Window getWindow() { return null; }
  public void startActivity(Intent i) {}
  public void runOnUiThread(Runnable r) {}
  public void onBackPressed() {}
  protected void onDestroy() {}
  protected void onSaveInstanceState(android.os.Bundle out) {}
  public android.content.res.Resources getResources() { return null; }
}
