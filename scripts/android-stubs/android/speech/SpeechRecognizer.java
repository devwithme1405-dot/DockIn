package android.speech;
import android.content.Context;
import android.content.Intent;
public class SpeechRecognizer {
  public static final String RESULTS_RECOGNITION = "results_recognition";
  public static final int ERROR_NETWORK_TIMEOUT = 1, ERROR_NETWORK = 2, ERROR_AUDIO = 3, ERROR_SERVER = 4, ERROR_CLIENT = 5,
      ERROR_SPEECH_TIMEOUT = 6, ERROR_NO_MATCH = 7, ERROR_RECOGNIZER_BUSY = 8, ERROR_INSUFFICIENT_PERMISSIONS = 9;
  public static boolean isRecognitionAvailable(Context c) { return false; }
  public static SpeechRecognizer createSpeechRecognizer(Context c) { return null; }
  public void setRecognitionListener(RecognitionListener l) {}
  public void startListening(Intent i) {}
  public void stopListening() {}
  public void cancel() {}
  public void destroy() {}
}
