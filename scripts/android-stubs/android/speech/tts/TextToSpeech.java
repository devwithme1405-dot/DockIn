package android.speech.tts;
import android.content.Context;
import android.os.Bundle;
import java.util.Locale;
public class TextToSpeech {
  public static final int SUCCESS = 0, ERROR = -1, QUEUE_FLUSH = 0, LANG_MISSING_DATA = -1, LANG_NOT_SUPPORTED = -2;
  public interface OnInitListener { void onInit(int status); }
  public TextToSpeech(Context c, OnInitListener l) {}
  public int setLanguage(Locale l) { return 0; }
  public int speak(CharSequence text, int queueMode, Bundle params, String utteranceId) { return 0; }
  public int setOnUtteranceProgressListener(UtteranceProgressListener l) { return 0; }
  public int stop() { return 0; }
  public void shutdown() {}
}
