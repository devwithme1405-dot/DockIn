package com.dockin.student;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * The smallest HTTP client that does the job: one request, the status and the
 * body back, nothing cached and nothing followed across sites.
 */
final class Net {

    private static final int TIMEOUT_MS = 20_000;
    /** No answer from Camu or the LMS is ever this big; anything larger is not what we asked for. */
    private static final int MAX_BODY = 4 * 1024 * 1024;

    private Net() {}

    static final class Res {
        final int code;
        final String body;
        final Map<String, List<String>> headers;

        Res(int code, String body, Map<String, List<String>> headers) {
            this.code = code;
            this.body = body;
            this.headers = headers == null ? Collections.<String, List<String>>emptyMap() : headers;
        }

        boolean ok() {
            return code >= 200 && code < 300;
        }

        boolean redirect() {
            return code >= 300 && code < 400;
        }

        /** Every value of one header, whatever case the server wrote its name in. */
        List<String> all(String name) {
            List<String> out = new ArrayList<>();
            for (Map.Entry<String, List<String>> h : headers.entrySet()) {
                if (h.getKey() != null && h.getKey().equalsIgnoreCase(name) && h.getValue() != null) {
                    out.addAll(h.getValue());
                }
            }
            return out;
        }

        String header(String name) {
            List<String> v = all(name);
            return v.isEmpty() ? null : v.get(0);
        }
    }

    static Res get(String url, Map<String, String> headers) throws IOException {
        return send("GET", url, null, null, headers);
    }

    static Res postJson(String url, String json, Map<String, String> headers) throws IOException {
        return send("POST", url, json, "application/json", headers);
    }

    static Res postForm(String url, Map<String, String> form, Map<String, String> headers) throws IOException {
        StringBuilder b = new StringBuilder();
        for (Map.Entry<String, String> e : form.entrySet()) {
            if (b.length() > 0) b.append('&');
            b.append(URLEncoder.encode(e.getKey(), "UTF-8")).append('=')
                    .append(URLEncoder.encode(e.getValue() == null ? "" : e.getValue(), "UTF-8"));
        }
        return send("POST", url, b.toString(), "application/x-www-form-urlencoded", headers);
    }

    private static Res send(String method, String url, String body, String type, Map<String, String> headers)
            throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setRequestMethod(method);
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setInstanceFollowRedirects(false);
            c.setUseCaches(false);
            c.setRequestProperty("Accept", "application/json, text/plain, */*");
            if (headers != null) {
                for (Map.Entry<String, String> h : headers.entrySet()) {
                    if (h.getValue() != null) c.setRequestProperty(h.getKey(), h.getValue());
                }
            }
            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", type + "; charset=utf-8");
                c.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream out = c.getOutputStream()) {
                    out.write(bytes);
                }
            }
            int code = c.getResponseCode();
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            return new Res(code, in == null ? "" : read(in), c.getHeaderFields());
        } finally {
            c.disconnect();
        }
    }

    private static String read(InputStream in) throws IOException {
        try (InputStream src = in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = src.read(buf)) != -1) {
                out.write(buf, 0, n);
                if (out.size() > MAX_BODY) throw new IOException("Answer too large");
            }
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }
}
