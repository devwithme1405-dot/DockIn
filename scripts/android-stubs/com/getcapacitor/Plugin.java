package com.getcapacitor;
import android.content.Context;
import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
public class Plugin {
  public void load() {}
  public Context getContext() { return null; }
  public AppCompatActivity getActivity() { return null; }
  protected void notifyListeners(String eventName, JSObject data, boolean retainUntilConsumed) {}
  protected void notifyListeners(String eventName, JSObject data) {}
  public PermissionState getPermissionState(String alias) { return null; }
  protected void requestPermissionForAlias(@NonNull String alias, @NonNull PluginCall call, @NonNull String callbackName) {}
  protected void handleOnNewIntent(Intent intent) {}
  protected void handleOnResume() {}
}
