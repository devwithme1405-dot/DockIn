package android.speech.tts;
public abstract class UtteranceProgressListener {
  public abstract void onStart(String utteranceId);
  public abstract void onDone(String utteranceId);
  public abstract void onError(String utteranceId);
}
