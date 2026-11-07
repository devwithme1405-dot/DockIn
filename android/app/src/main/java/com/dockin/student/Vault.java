package com.dockin.student;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The few secrets DockIn keeps: the Camu session and the LMS login.
 *
 * Each value is encrypted with a key that lives in the phone's Android
 * Keystore. The key never leaves the secure hardware and is never backed up, so
 * a copy of the app's files (a backup, a rooted phone's dump) holds only
 * ciphertext. If the key is gone — a restore onto a new phone — the values
 * simply read as missing and the person connects again.
 */
final class Vault {

    private static final String ALIAS = "dockin-vault";
    private static final String PREFS = "dockin-vault";

    private Vault() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void put(Context c, String name, String value) {
        if (value == null) {
            remove(c, name);
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = cipher.getIV();
            byte[] sealed = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String stored = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(sealed, Base64.NO_WRAP);
            prefs(c).edit().putString(name, stored).apply();
        } catch (Exception e) {
            // Without a working keystore nothing is written in the clear instead.
            remove(c, name);
        }
    }

    static synchronized String get(Context c, String name) {
        String stored = prefs(c).getString(name, null);
        if (stored == null) return null;
        int cut = stored.indexOf(':');
        if (cut <= 0) return null;
        try {
            byte[] iv = Base64.decode(stored.substring(0, cut), Base64.NO_WRAP);
            byte[] sealed = Base64.decode(stored.substring(cut + 1), Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(sealed), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    static synchronized void remove(Context c, String... names) {
        SharedPreferences.Editor e = prefs(c).edit();
        for (String n : names) e.remove(n);
        e.apply();
    }

    private static SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) {
            KeyStore.Entry entry = ks.getEntry(ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            ks.deleteEntry(ALIAS);
        }
        KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return g.generateKey();
    }
}
