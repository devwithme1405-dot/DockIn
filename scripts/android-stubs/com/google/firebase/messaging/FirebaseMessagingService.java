package com.google.firebase.messaging;
public class FirebaseMessagingService extends android.app.Service {
  public android.os.IBinder onBind(android.content.Intent i) { return null; }
  public void onMessageReceived(RemoteMessage m) {}
  public void onNewToken(String s) {}
}
