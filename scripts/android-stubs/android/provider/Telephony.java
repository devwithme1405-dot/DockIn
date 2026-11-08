package android.provider;

import android.content.Intent;
import android.telephony.SmsMessage;

public final class Telephony {
  public static final class Sms {
    public static final class Intents {
      public static final String SMS_RECEIVED_ACTION = "android.provider.Telephony.SMS_RECEIVED";
      public static SmsMessage[] getMessagesFromIntent(Intent intent) { return new SmsMessage[0]; }
    }
  }
}
