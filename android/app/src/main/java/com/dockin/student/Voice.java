package com.dockin.student;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * The assistant's ears and voice: the phone's own speech-to-text and
 * text-to-speech. Free, fast, works in Indian languages, and nothing leaves the
 * phone except through Google's own recogniser, the same one the keyboard mic
 * uses. Everything here runs on the main thread, as Android requires.
 */
final class Voice {

    /** Where results go: the plugin, as "speech" / "speak" events. */
    interface Out {
        void emit(String event, JSObject data);
    }

    private final Context context;
    private final Out out;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String pendingText;
    private String pendingLang;

    Voice(Context context, Out out) {
        this.context = context.getApplicationContext();
        this.out = out;
    }

    static boolean canListen(Context c) {
        return SpeechRecognizer.isRecognitionAvailable(c);
    }

    /** Start listening. `lang` is a BCP-47 tag like "en-IN" or "hi-IN". Main thread only. */
    void listen(String lang) {
        stopListening();
        recognizer = SpeechRecognizer.createSpeechRecognizer(context);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                state("ready");
            }

            @Override
            public void onBeginningOfSpeech() {
                state("speaking");
            }

            @Override
            public void onRmsChanged(float rmsdB) {
                // Roughly -2 (silence) … 10 (loud): 0..1 for the waveform.
                JSObject o = new JSObject();
                o.put("type", "level");
                o.put("level", Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f)));
                out.emit("speech", o);
            }

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                state("processing");
            }

            @Override
            public void onError(int error) {
                JSObject o = new JSObject();
                o.put("type", "error");
                o.put("code", errorName(error));
                out.emit("speech", o);
                release();
            }

            @Override
            public void onResults(Bundle results) {
                JSObject o = new JSObject();
                o.put("type", "final");
                o.put("text", best(results));
                out.emit("speech", o);
                release();
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                String text = best(partialResults);
                if (text.isEmpty()) return;
                JSObject o = new JSObject();
                o.put("type", "partial");
                o.put("text", text);
                out.emit("speech", o);
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        // A student pauses mid-sentence ("kal… 3 baje… day out"): give them a moment.
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L);
        i.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L);
        recognizer.startListening(i);
    }

    /** Stop and keep what was heard (it arrives as a "final" event). */
    void finish() {
        if (recognizer != null) recognizer.stopListening();
    }

    /** Stop and throw away. */
    void stopListening() {
        if (recognizer != null) {
            recognizer.cancel();
            release();
        }
    }

    private void release() {
        if (recognizer == null) return;
        try {
            recognizer.destroy();
        } catch (RuntimeException ignored) {
            // Already gone.
        }
        recognizer = null;
    }

    private void state(String s) {
        JSObject o = new JSObject();
        o.put("type", "state");
        o.put("state", s);
        out.emit("speech", o);
    }

    private static String best(Bundle b) {
        if (b == null) return "";
        ArrayList<String> list = b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() || list.get(0) == null ? "" : list.get(0).trim();
    }

    private static String errorName(int e) {
        switch (e) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "NO_SPEECH";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "NETWORK";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "MIC_DENIED";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "BUSY";
            case SpeechRecognizer.ERROR_AUDIO:
                return "AUDIO";
            default:
                return "ERROR_" + e;
        }
    }

    /** Read a reply aloud in `lang`. Main thread only. */
    void speak(String text, String lang) {
        if (text == null || text.trim().isEmpty()) return;
        if (tts == null) {
            pendingText = text;
            pendingLang = lang;
            tts = new TextToSpeech(context, status -> {
                ttsReady = status == TextToSpeech.SUCCESS;
                if (!ttsReady) {
                    JSObject o = new JSObject();
                    o.put("type", "error");
                    out.emit("speak", o);
                    return;
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override
                    public void onStart(String id) {
                        JSObject o = new JSObject();
                        o.put("type", "start");
                        out.emit("speak", o);
                    }

                    @Override
                    public void onDone(String id) {
                        JSObject o = new JSObject();
                        o.put("type", "done");
                        out.emit("speak", o);
                    }

                    @Override
                    public void onError(String id) {
                        JSObject o = new JSObject();
                        o.put("type", "error");
                        out.emit("speak", o);
                    }
                });
                if (pendingText != null) say(pendingText, pendingLang);
                pendingText = null;
            });
            return;
        }
        if (ttsReady) say(text, lang);
        else {
            pendingText = text;
            pendingLang = lang;
        }
    }

    private void say(String text, String lang) {
        Locale loc = Locale.forLanguageTag(lang == null || lang.isEmpty() ? "en-IN" : lang);
        int ok = tts.setLanguage(loc);
        if (ok == TextToSpeech.LANG_MISSING_DATA || ok == TextToSpeech.LANG_NOT_SUPPORTED) tts.setLanguage(new Locale("en", "IN"));
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "dockin-say");
    }

    void stopSpeaking() {
        if (tts != null) tts.stop();
    }

    void shutdown() {
        stopListening();
        if (tts != null) {
            tts.shutdown();
            tts = null;
            ttsReady = false;
        }
    }
}
