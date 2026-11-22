package com.dockin.student;

import com.sun.net.httpserver.HttpServer;
import org.json.JSONObject;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;

public class UpdaterTest {
    static byte[] apk = new byte[3_000_000];
    static AtomicInteger flakyHits = new AtomicInteger();
    static int pass = 0, fail = 0;
    static void check(String name, boolean ok) { System.out.println((ok ? "ok   " : "FAIL ") + name); if (ok) pass++; else fail++; }

    public static void main(String[] a) throws Exception {
        new Random(7).nextBytes(apk);
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        s.createContext("/redirect", ex -> { ex.getResponseHeaders().add("Location", "/file"); ex.sendResponseHeaders(302, -1); ex.close(); });
        s.createContext("/file", ex -> serve(ex, false));
        s.createContext("/flaky", ex -> {
            String rg = ex.getRequestHeaders().getFirst("Range");
            boolean probe = "bytes=0-0".equals(rg);
            serve(ex, !probe && flakyHits.getAndIncrement() == 0);
        });
        s.createContext("/slow", ex -> serve(ex, false, 1_000_000));
        s.createContext("/norange", ex -> { ex.sendResponseHeaders(200, apk.length); ex.getResponseBody().write(apk); ex.close(); });
        s.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(16));
        s.start();
        String base = "http://127.0.0.1:" + s.getAddress().getPort();
        File tmp = Files.createTempDirectory("up").toFile();
        String sha = sha(apk);
        Updater.Release good = rel(77, sha, apk.length);
        List<Integer> seen = new ArrayList<>();

        File f = Updater.download(new File(tmp, "a"), good, base + "/redirect", seen::add);
        check("downloads through GitHub-style redirect, file is byte-identical", Arrays.equals(Files.readAllBytes(f.toPath()), apk));
        check("progress reported, ends high", !seen.isEmpty() && seen.get(seen.size() - 1) >= 99);
        long t0 = System.currentTimeMillis();
        File again = Updater.download(new File(tmp, "a"), good, base + "/nothing-here", p -> {});
        check("already downloaded: no network needed", again.equals(f) && System.currentTimeMillis() - t0 < 2000);

        File g = Updater.download(new File(tmp, "b"), good, base + "/flaky", p -> {});
        check("connection drops halfway: resumes and finishes intact", Arrays.equals(Files.readAllBytes(g.toPath()), apk) && flakyHits.get() >= 2);

        File dirC = new File(tmp, "c"); dirC.mkdirs();
        File part = new File(dirC, "DockIn-77.apk.part");
        Files.write(part.toPath(), Arrays.copyOf(apk, 1000));
        File h = Updater.download(dirC, good, base + "/norange", p -> {});
        check("server ignores resume: starts over, still intact", Arrays.equals(Files.readAllBytes(h.toPath()), apk));

        Updater.Release wrong = rel(78, "00".repeat(32), apk.length);
        boolean threw = false;
        try { Updater.download(new File(tmp, "d"), wrong, base + "/file", p -> {}); } catch (IOException e) { threw = true; }
        File[] left = new File(tmp, "d").listFiles();
        check("wrong SHA-256: refused, nothing left behind", threw && (left == null || left.length == 0));

        Updater.Release shortSize = rel(79, "", apk.length + 5);
        threw = false;
        try { Updater.download(new File(tmp, "e"), shortSize, base + "/file", p -> {}); } catch (IOException e) { threw = true; }
        check("size not as promised: refused", threw);

        Updater.Release older = rel(80, "", 0);
        File o = Updater.download(new File(tmp, "f"), older, base + "/file", p -> {});
        check("old version.json without size/sha still works", o.length() == apk.length);

        File dirG = new File(tmp, "g"); dirG.mkdirs();
        Files.write(new File(dirG, "DockIn-1.apk").toPath(), new byte[]{1, 2});
        Updater.download(dirG, good, base + "/file", p -> {});
        check("older downloads are cleared", !new File(dirG, "DockIn-1.apk").exists());

        long t1 = System.currentTimeMillis();
        File fast = Updater.download(new File(tmp, "h"), good, base + "/slow", p -> {});
        long parallelMs = System.currentTimeMillis() - t1;
        check("big file on a slow line: several connections at once, intact (" + parallelMs + " ms for 3 MB at 1 MB/s per connection)",
              Arrays.equals(Files.readAllBytes(fast.toPath()), apk) && parallelMs < 2200);
        File[] leftovers = new File(tmp, "h").listFiles();
        check("pieces cleaned up after joining", leftovers != null && leftovers.length == 1);

        s.stop(0);
        System.out.println("\n" + pass + " ok, " + fail + " failed");
        System.exit(fail == 0 ? 0 : 1);
    }

    static Updater.Release rel(long code, String sha, long size) throws Exception {
        JSONObject j = new JSONObject();
        j.put("versionCode", code); j.put("versionName", "2.0." + code); j.put("sha256", sha); j.put("size", size);
        return new Updater.Release(j);
    }

    /** Serves the APK like GitHub's file storage: full file, or a byte range (206). */
    static void serve(com.sun.net.httpserver.HttpExchange ex, boolean dropHalfway) throws IOException { serve(ex, dropHalfway, 0); }

    static void serve(com.sun.net.httpserver.HttpExchange ex, boolean dropHalfway, int bytesPerSecond) throws IOException {
        String range = ex.getRequestHeaders().getFirst("Range");
        int from = 0, to = apk.length - 1;
        boolean ranged = range != null && range.startsWith("bytes=");
        if (ranged) {
            String[] ab = range.substring(6).split("-", -1);
            from = Integer.parseInt(ab[0]);
            if (!ab[1].isEmpty()) to = Math.min(apk.length - 1, Integer.parseInt(ab[1]));
        }
        if (from >= apk.length) { ex.sendResponseHeaders(416, -1); ex.close(); return; }
        int len = to - from + 1;
        ex.sendResponseHeaders(ranged ? 206 : 200, len);
        OutputStream o = ex.getResponseBody();
        if (dropHalfway && len > 2) { o.write(apk, from, len / 2); o.flush(); ex.close(); return; }
        if (bytesPerSecond > 0) {
            int step = 16 * 1024;
            for (int at = from; at <= to; at += step) {
                o.write(apk, at, Math.min(step, to - at + 1));
                o.flush();
                try { Thread.sleep(1000L * step / bytesPerSecond); } catch (InterruptedException ignored) {}
            }
            o.close();
            return;
        }
        o.write(apk, from, len); o.close();
    }

    static String sha(byte[] b) throws Exception {
        java.security.MessageDigest md = java.security.MessageDigest.getInstance("SHA-256");
        StringBuilder sb = new StringBuilder(); for (byte x : md.digest(b)) sb.append(String.format("%02x", x)); return sb.toString();
    }
}
