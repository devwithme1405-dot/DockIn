package com.dockin.student;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.ConnectivityManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationChannelCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Locale;

/**
 * In-app updates for the APK, straight from the GitHub release.
 *
 * CI publishes DockIn.apk and a small version.json next to it (version, size,
 * SHA-256). The app:
 *
 * 1. reads version.json — when DockIn opens, and every few hours in the
 *    background ({@link UpdateJob}), which posts a notification;
 * 2. downloads the APK, resuming where a weak connection dropped it, and checks
 *    it is whole (size + SHA-256), really DockIn, newer, and signed with the
 *    same key as the app already on the phone — anything else is thrown away;
 * 3. installs it through Android's PackageInstaller. On Android 12+ that can
 *    happen without a confirm screen once DockIn has updated itself before;
 *    otherwise Android asks once, "Update DockIn?", and that's it.
 */
final class Updater {
    static final String BASE = "https://github.com/devwithme1405-dot/DockIn/releases/download/apk-latest/";
    static final String CHANNEL = "updates";
    /** Same tag as the update push from the server, so the two never stack up. */
    static final String TAG = "dockin-update";
    private static final String PREFS = "dockin_update";

    interface Progress {
        void at(int percent);
    }

    /** What the newest release says about itself. */
    static final class Release {
        final long code;
        final String name;
        final String sha256;
        final long size;

        Release(JSONObject j) {
            code = j.optLong("versionCode", 0);
            name = j.optString("versionName", "");
            sha256 = j.optString("sha256", "").trim().toLowerCase(Locale.US);
            size = j.optLong("size", 0);
        }
    }

    private Updater() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** This phone's own versionCode. */
    static long current(Context c) {
        try {
            PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : (long) info.versionCode;
        } catch (PackageManager.NameNotFoundException e) {
            return 0;
        }
    }

    /** True when DockIn may hand APKs to Android's installer ("Install unknown apps"). */
    static boolean canInstall(Context c) {
        return Build.VERSION.SDK_INT < 26 || c.getPackageManager().canRequestPackageInstalls();
    }

    // -------------------------------------------------------------------------
    // Network

    /** Follows GitHub's redirect to its file storage, asking for bytes from `from` on. */
    private static HttpURLConnection open(String url, long from) throws IOException {
        String at = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection c = (HttpURLConnection) new URL(at).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15_000);
            c.setReadTimeout(30_000);
            c.setRequestProperty("Accept", "*/*");
            c.setRequestProperty("Cache-Control", "no-cache");
            if (from > 0) c.setRequestProperty("Range", "bytes=" + from + "-");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400) {
                String next = c.getHeaderField("Location");
                c.disconnect();
                if (next == null) throw new IOException("Redirect without a place to go");
                at = new URL(new URL(at), next).toString();
                continue;
            }
            if (code == 416 && from > 0) {
                c.disconnect();
                throw new RangeGone();
            }
            if (code != 200 && code != 206) {
                c.disconnect();
                throw new IOException("GitHub answered " + code);
            }
            return c;
        }
        throw new IOException("Too many redirects");
    }

    /** The server no longer has bytes from where we stopped: start the file over. */
    private static final class RangeGone extends IOException {
        RangeGone() {
            super("range not satisfiable");
        }
    }

    /** The newest published release. Tries a few times: a weak line often answers on the second go. */
    static Release latest() throws Exception {
        Exception last = null;
        for (int attempt = 0; attempt < 3; attempt++) {
            try {
                HttpURLConnection c = open(BASE + "version.json?t=" + System.currentTimeMillis(), 0);
                try (InputStream in = c.getInputStream()) {
                    byte[] buf = new byte[8192];
                    StringBuilder sb = new StringBuilder();
                    int n;
                    while ((n = in.read(buf)) != -1) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                    Release r = new Release(new JSONObject(sb.toString()));
                    if (r.code <= 0) throw new IOException("version.json has no versionCode");
                    return r;
                } finally {
                    c.disconnect();
                }
            } catch (Exception e) {
                last = e;
                pause(1000L * (attempt + 1));
            }
        }
        throw last;
    }

    // -------------------------------------------------------------------------
    // Download

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    static File fileFor(File dir, long code) {
        return new File(dir, "DockIn-" + code + ".apk");
    }

    /** Already downloaded and whole, so Update can go straight to installing. */
    static boolean ready(Context c, Release r) {
        File f = fileFor(dir(c), r.code);
        return f.exists() && whole(f, r);
    }

    /**
     * Downloads the release into `dir` and returns the finished file. Resumes a
     * part-download, retries a dropped connection a few times, and only returns
     * a file whose size and SHA-256 match what the release promised.
     */
    static File download(File dir, Release r, String url, Progress progress) throws IOException {
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File done = fileFor(dir, r.code);
        if (done.exists() && whole(done, r)) {
            progress.at(100);
            return done;
        }
        File part = new File(dir, done.getName() + ".part");
        // Anything left from an older release goes.
        File[] old = dir.listFiles();
        if (old != null) {
            for (File f : old) {
                if (!f.getName().equals(done.getName()) && !f.getName().equals(part.getName())) {
                    //noinspection ResultOfMethodCallIgnored
                    f.delete();
                }
            }
        }
        IOException last = null;
        int damaged = 0;
        for (int attempt = 0; attempt < 5; attempt++) {
            try {
                fetch(url, part, progress);
                if (!whole(part, r)) {
                    //noinspection ResultOfMethodCallIgnored
                    part.delete();
                    // Once can be a bad line; twice means the file itself is off — stop spending data.
                    if (++damaged >= 2) throw new IOException("The update file didn't check out. Try again later.");
                    throw new IOException("The download was damaged.");
                }
                //noinspection ResultOfMethodCallIgnored
                done.delete();
                if (!part.renameTo(done)) throw new IOException("Could not save the update.");
                return done;
            } catch (RangeGone e) {
                //noinspection ResultOfMethodCallIgnored
                part.delete();
                last = e;
            } catch (IOException e) {
                last = e;
                if (damaged >= 2) throw e;
                pause(1500L * (attempt + 1));
            }
        }
        throw new IOException("The download did not finish. Try again on a better connection.", last);
    }

    private static void fetch(String url, File part, Progress progress) throws IOException {
        long have = part.exists() ? part.length() : 0;
        HttpURLConnection c = open(url, have);
        try {
            boolean resume = have > 0 && c.getResponseCode() == 206;
            if (!resume) have = 0;
            long len = c.getContentLengthLong();
            long total = len > 0 ? have + len : -1;
            try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(part, resume)) {
                byte[] buf = new byte[64 * 1024];
                long got = have;
                int last = -1;
                int n;
                while ((n = in.read(buf)) != -1) {
                    o.write(buf, 0, n);
                    got += n;
                    if (total > 0) {
                        int pct = (int) Math.min(99, got * 100 / total);
                        if (pct != last) {
                            last = pct;
                            progress.at(pct);
                        }
                    }
                }
            }
            if (total > 0 && part.length() != total) throw new IOException("The download stopped early.");
        } finally {
            c.disconnect();
        }
    }

    /** Size and SHA-256 as the release promised (older releases list neither: any non-empty file). */
    static boolean whole(File f, Release r) {
        if (!f.exists() || f.length() == 0) return false;
        if (r.size > 0 && f.length() != r.size) return false;
        if (r.sha256.isEmpty()) return true;
        try {
            return r.sha256.equals(sha256(f));
        } catch (IOException e) {
            return false;
        }
    }

    static String sha256(File f) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) md.update(buf, 0, n);
            StringBuilder sb = new StringBuilder();
            for (byte b : md.digest()) sb.append(String.format(Locale.US, "%02x", b));
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    // -------------------------------------------------------------------------
    // Checking the APK itself

    /**
     * The file must be DockIn, newer than this copy, and signed with the same
     * key. Android would refuse a wrong signature anyway — checking first means
     * a clear message instead of a failed install, and a damaged file is
     * deleted so the next try downloads it again.
     */
    @SuppressWarnings("deprecation")
    static void verify(Context c, File apk) throws IOException {
        PackageManager pm = c.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo a = pm.getPackageArchiveInfo(apk.getPath(), flags);
        if (a == null) {
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            throw new IOException("The update file was damaged. Try again.");
        }
        if (!c.getPackageName().equals(a.packageName)) {
            //noinspection ResultOfMethodCallIgnored
            apk.delete();
            throw new IOException("That file isn't DockIn.");
        }
        long code = Build.VERSION.SDK_INT >= 28 ? a.getLongVersionCode() : (long) a.versionCode;
        if (code <= current(c)) throw new IOException("You already have the newest DockIn.");
        Signature[] theirs = signers(a);
        if (theirs == null || theirs.length == 0) return; // can't read them here: Android checks on install
        try {
            PackageInfo mine = pm.getPackageInfo(c.getPackageName(), flags);
            Signature[] ours = signers(mine);
            if (ours != null && ours.length > 0 && !sameSigners(ours, theirs)) {
                //noinspection ResultOfMethodCallIgnored
                apk.delete();
                throw new IOException("This update isn't signed by DockIn, so it was not installed.");
            }
        } catch (PackageManager.NameNotFoundException ignored) {
            // Can't happen for our own package.
        }
    }

    @SuppressWarnings("deprecation")
    private static Signature[] signers(PackageInfo p) {
        if (Build.VERSION.SDK_INT >= 28) {
            if (p.signingInfo == null) return null;
            return p.signingInfo.hasMultipleSigners() ? p.signingInfo.getApkContentsSigners() : p.signingInfo.getSigningCertificateHistory();
        }
        return p.signatures;
    }

    private static boolean sameSigners(Signature[] a, Signature[] b) {
        // Key rotation keeps the old certificate in the history, so any shared one is enough.
        for (Signature x : a) {
            for (Signature y : b) {
                if (Arrays.equals(x.toByteArray(), y.toByteArray())) return true;
            }
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Installing

    /**
     * Hands the APK to Android's PackageInstaller. The answer arrives in
     * {@link InstallReceiver}: done, "confirm on screen", or why it failed.
     * Phones whose installer refuses sessions get the classic install screen.
     */
    static void install(Context c, File apk) throws IOException {
        prefs(c).edit().putLong("installing_at", System.currentTimeMillis()).apply();
        try {
            installSession(c, apk);
        } catch (Exception e) {
            installViewIntent(c, apk);
        }
    }

    private static void installSession(Context c, File apk) throws IOException {
        PackageInstaller pi = c.getPackageManager().getPackageInstaller();
        // Sessions left over from an earlier try would only get in the way.
        for (PackageInstaller.SessionInfo s : pi.getMySessions()) {
            try {
                pi.abandonSession(s.getSessionId());
            } catch (Exception ignored) {
                // Already gone.
            }
        }
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(c.getPackageName());
        params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= 31) {
            // DockIn updating itself: Android 12+ may skip the confirm screen.
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = pi.createSession(params);
        PackageInstaller.Session session = pi.openSession(id);
        try {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("DockIn.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                session.fsync(out);
            }
            Intent status = new Intent(c, InstallReceiver.class).setAction(InstallReceiver.ACTION);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent pending = PendingIntent.getBroadcast(c, id, status, flags);
            session.commit(pending.getIntentSender());
        } catch (IOException | RuntimeException e) {
            session.abandon();
            throw e;
        } finally {
            session.close();
        }
    }

    private static void installViewIntent(Context c, File apk) {
        Uri uri = androidx.core.content.FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", apk);
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(uri, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(install);
    }

    /** Words for what PackageInstaller reported. */
    static String failureText(int status) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                return "The update was cancelled. Tap Update to try again.";
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                return "Not enough space on the phone. Free up a little and try again.";
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                return "The phone blocked the update. Allow DockIn to install apps, then try again.";
            case PackageInstaller.STATUS_FAILURE_CONFLICT:
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                return "This copy of DockIn can't be updated in place. Get the app again from dock-in.vercel.app/DockIn.apk.";
            case PackageInstaller.STATUS_FAILURE_INVALID:
                return "The update file was damaged. Try again.";
            default:
                return "The update didn't install. Try again.";
        }
    }

    // -------------------------------------------------------------------------
    // Background check and notifications

    /** On Wi-Fi (or any unmetered line) the update is fetched ahead, so Update installs at once. */
    static boolean unmetered(Context c) {
        ConnectivityManager cm = (ConnectivityManager) c.getSystemService(Context.CONNECTIVITY_SERVICE);
        return cm != null && !cm.isActiveNetworkMetered();
    }

    /** {@link UpdateJob}: is there a newer DockIn? Tell the person — once, then again daily until updated. */
    static void backgroundCheck(Context c) {
        Release r;
        try {
            r = latest();
        } catch (Exception e) {
            return; // next run
        }
        if (r.code <= current(c)) {
            cleanUp(c);
            return;
        }
        boolean ready = ready(c, r);
        if (!ready && unmetered(c)) {
            try {
                File f = download(dir(c), r, BASE + "DockIn.apk", new Progress() {
                    @Override
                    public void at(int percent) {}
                });
                verify(c, f);
                ready = true;
            } catch (IOException ignored) {
                // Downloads when they tap Update instead.
            }
        }
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis();
        boolean newVersion = p.getLong("notified_code", 0) != r.code;
        boolean dueAgain = now - p.getLong("notified_at", 0) > 20L * 3600_000L;
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        boolean night = hour >= 23 || hour < 8;
        if ((newVersion || dueAgain) && !night) {
            notifyAvailable(c, r, ready);
            p.edit().putLong("notified_code", r.code).putLong("notified_at", now).apply();
        }
    }

    static void ensureChannel(Context c) {
        NotificationManagerCompat.from(c).createNotificationChannel(
                new NotificationChannelCompat.Builder(CHANNEL, NotificationManagerCompat.IMPORTANCE_HIGH)
                        .setName(c.getString(R.string.channel_updates))
                        .setDescription(c.getString(R.string.channel_updates_about))
                        .build());
    }

    private static PendingIntent openApp(Context c, int request, String path) {
        Intent open = new Intent(c, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(MainActivity.EXTRA_OPEN, path);
        return PendingIntent.getActivity(c, request, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void post(Context c, String title, String text, PendingIntent tap) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(c);
        if (!nm.areNotificationsEnabled()) return;
        ensureChannel(c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_dockin)
                .setColor(0xFF7C3D1B)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(tap)
                .setPriority(NotificationCompat.PRIORITY_HIGH);
        try {
            nm.notify(TAG, 0, b.build());
        } catch (SecurityException ignored) {
            // Notifications switched off meanwhile.
        }
    }

    static void notifyAvailable(Context c, Release r, boolean ready) {
        String name = r.name.isEmpty() ? "" : " " + r.name;
        post(c, "DockIn update ready 🎉",
                "Version" + name + " is here. Tap to " + (ready ? "install" : "update") + " — takes a few seconds, your data stays.",
                openApp(c, 9101, "/?update=1"));
    }

    /** The install needs one tap from the person and DockIn isn't on screen to show it. */
    static void notifyConfirm(Context c, Intent confirm) {
        PendingIntent tap = PendingIntent.getActivity(c, 9102, confirm, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        post(c, "Finish updating DockIn", "One tap to install the new version.", tap);
    }

    static void notifyFailed(Context c, String why) {
        post(c, "DockIn didn't update", why, openApp(c, 9103, "/?update=1"));
    }

    /** After the new version is in place (MY_PACKAGE_REPLACED). */
    static void afterUpdate(Context c) {
        SharedPreferences p = prefs(c);
        long started = p.getLong("installing_at", 0);
        cleanUp(c);
        NotificationManagerCompat.from(c).cancel(TAG, 0);
        if (started > 0 && System.currentTimeMillis() - started < 2L * 86400_000L) {
            String version = "";
            try {
                PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
                version = info.versionName == null ? "" : " " + info.versionName;
            } catch (PackageManager.NameNotFoundException ignored) {
                // Name stays blank.
            }
            post(c, "DockIn is updated ✓", "You're on version" + version + ". Tap to open.", openApp(c, 9104, "/"));
        }
        p.edit().remove("installing_at").apply();
    }

    /** Downloads are only kept until the update is in. */
    static void cleanUp(Context c) {
        File[] files = dir(c).listFiles();
        if (files == null) return;
        for (File f : files) {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private static void pause(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
