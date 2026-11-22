package com.dockin.student;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Something shared to DockIn from another app (Android's share sheet): text, a
 * link, or documents — never images. The files are copied into DockIn's own
 * cache, so the web side can read them at its pace; the share waits here until
 * the web app takes it.
 */
final class ShareIn {

    private ShareIn() {}

    /** Biggest document taken (chat's own limit). */
    static final long MAX_FILE = 50L * 1024 * 1024;
    static final int MAX_FILES = 10;

    private static JSONObject waiting;

    static synchronized JSONObject take() {
        JSONObject w = waiting;
        waiting = null;
        return w;
    }

    static synchronized void put(JSONObject share) {
        waiting = share;
    }

    static boolean isShare(Intent intent) {
        if (intent == null) return false;
        String a = intent.getAction();
        return Intent.ACTION_SEND.equals(a) || Intent.ACTION_SEND_MULTIPLE.equals(a);
    }

    static File dir(Context c) {
        return new File(c.getCacheDir(), "shared-in");
    }

    /** Reads the share out of the intent (copying its files). Runs off the main thread. */
    static JSONObject read(Context c, Intent intent) throws JSONException {
        JSONObject out = new JSONObject();
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text != null && text.length() > 0) out.put("text", text.toString());
        if (subject != null && !subject.isEmpty()) out.put("subject", subject);

        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else {
            Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (one != null) uris.add(one);
        }

        JSONArray files = new JSONArray();
        int skipped = 0;
        File base = new File(dir(c), UUID.randomUUID().toString());
        for (Uri u : uris) {
            if (files.length() >= MAX_FILES) break;
            try {
                JSONObject f = copy(c, u, base);
                if (f == null) skipped++;
                else files.put(f);
            } catch (Exception e) {
                skipped++;
            }
        }
        if (files.length() > 0) out.put("files", files);
        if (skipped > 0) out.put("skipped", skipped);
        return out;
    }

    private static JSONObject copy(Context c, Uri uri, File base) throws Exception {
        ContentResolver cr = c.getContentResolver();
        String type = cr.getType(uri);
        if (type != null && type.startsWith("image/")) return null; // documents only
        String name = null;
        long size = -1;
        try (Cursor q = cr.query(uri, new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
            if (q != null && q.moveToFirst()) {
                int n = q.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int s = q.getColumnIndex(OpenableColumns.SIZE);
                if (n >= 0) name = q.getString(n);
                if (s >= 0 && !q.isNull(s)) size = q.getLong(s);
            }
        } catch (RuntimeException ignored) {
            // Some apps share without a name: one is made below.
        }
        if (size > MAX_FILE) return null;
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment() == null ? "document" : uri.getLastPathSegment();
        name = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        if (!base.exists() && !base.mkdirs()) return null;
        File out = new File(base, name);
        long total = 0;
        try (InputStream in = cr.openInputStream(uri); FileOutputStream fo = new FileOutputStream(out)) {
            if (in == null) return null;
            byte[] buf = new byte[64 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) {
                total += r;
                if (total > MAX_FILE) {
                    fo.close();
                    //noinspection ResultOfMethodCallIgnored
                    out.delete();
                    return null;
                }
                fo.write(buf, 0, r);
            }
        }
        JSONObject f = new JSONObject();
        f.put("name", name);
        f.put("type", type == null ? "" : type);
        f.put("size", total);
        f.put("path", out.getAbsolutePath());
        return f;
    }

    /** One piece of a copied file, as base64 (the bridge carries text). */
    static String chunk(Context c, String path, long offset, int length) throws Exception {
        File f = new File(path);
        // Only files this class copied.
        if (!f.getCanonicalPath().startsWith(dir(c).getCanonicalPath() + File.separator)) throw new SecurityException("Not a shared file.");
        try (RandomAccessFile raf = new RandomAccessFile(f, "r")) {
            long left = raf.length() - offset;
            if (left <= 0) return "";
            byte[] buf = new byte[(int) Math.min(length, left)];
            raf.seek(offset);
            raf.readFully(buf);
            return Base64.encodeToString(buf, Base64.NO_WRAP);
        }
    }

    /** Everything copied in earlier shares: gone. */
    static void clear(Context c) {
        delete(dir(c));
    }

    private static void delete(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) delete(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
