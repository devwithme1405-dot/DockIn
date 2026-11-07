package com.dockin.student;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URL;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bennett's LMS (Moodle, lms.bennett.edu.in), read-only: what still has to be
 * handed in, and by when.
 *
 * Moodle has two doors. The app door (a token from /login/token.php) is tried
 * first because it is the cleanest; Bennett keeps it shut, which is why the
 * Moodle app does not work there. So DockIn signs in through the website door
 * instead — the same form a browser fills — and asks the same question the
 * dashboard's Timeline asks, through Moodle's own page API.
 *
 * The username and password are kept encrypted in {@link Vault} so an expired
 * website session can be renewed in the background. They go to the LMS and
 * nowhere else. A wrong password is never retried on its own: Moodle locks
 * accounts after repeated failures, so the saved password is dropped and he is
 * asked to connect again.
 */
final class Lms {

    static final String BASE = "https://lms.bennett.edu.in";
    static final String V_TOKEN = "lms.token";
    static final String V_COOKIE = "lms.cookie";
    static final String V_USER = "lms.user";
    static final String V_PASS = "lms.pass";
    static final String K_NAME = "lms.name";

    private static final String TODO = "core_calendar_get_action_events_by_timesort";
    private static final Pattern LOGIN_TOKEN = Pattern.compile("name=\"logintoken\"\\s+value=\"([^\"]+)\"");
    private static final Pattern SESSKEY = Pattern.compile("\"sesskey\"\\s*:\\s*\"([A-Za-z0-9]+)\"");
    private static final Pattern SESSKEY_LINK = Pattern.compile("sesskey=([A-Za-z0-9]+)");
    private static final Pattern USER_NAME = Pattern.compile("class=\"usertext[^\"]*\"[^>]*>([^<]{2,80})<");
    private static final Pattern ERROR_BOX = Pattern.compile(
            "(?is)class=\"[^\"]*(?:loginerrors|alert-danger)[^\"]*\"[^>]*>(.{0,400}?)</");

    /** The LMS refused, in words a person can act on. */
    static final class Refused extends Exception {
        /** True when only the app door is shut, so the website door is worth trying. */
        final boolean appDoorShut;

        Refused(String message) {
            this(message, false);
        }

        Refused(String message, boolean appDoorShut) {
            super(message);
            this.appDoorShut = appDoorShut;
        }
    }

    /** The website session ended; signing in again fixes it. */
    private static final class Expired extends Exception {
        Expired() {
            super("LMS session ended");
        }
    }

    private Lms() {}

    /** Connected means he gave a username once; an error says whether it still works. */
    static boolean connected(Context c) {
        return Vault.get(c, V_USER) != null;
    }

    static void forget(Context c) {
        Vault.remove(c, V_TOKEN, V_COOKIE, V_USER, V_PASS);
        Camu.prefs(c).edit().remove(K_NAME).apply();
    }

    /**
     * Signs in, proves the to-do list can be read, and keeps what it needs.
     * Returns the name the LMS knows him by (may be empty).
     */
    static String connect(Context c, String user, String pass) throws IOException, Refused, JSONException {
        user = user.trim();
        String name;
        try {
            String token = appToken(user, pass);
            JSONObject me = call(token, "core_webservice_get_site_info", new LinkedHashMap<String, String>());
            name = me.optString("fullname", me.optString("firstname", ""));
            Vault.put(c, V_TOKEN, token);
            Vault.remove(c, V_COOKIE);
        } catch (Refused e) {
            if (!e.appDoorShut) throw e;
            Session s = webLogin(user, pass);
            try {
                webTodo(s.cookie);
            } catch (Expired x) {
                throw new Refused("The LMS let you in but would not show your assignments. Try again in a minute.");
            }
            name = s.name;
            Vault.put(c, V_COOKIE, s.cookie);
            Vault.remove(c, V_TOKEN);
        }
        Vault.put(c, V_USER, user);
        Vault.put(c, V_PASS, pass);
        Camu.prefs(c).edit().putString(K_NAME, name == null ? "" : name).apply();
        return name;
    }

    /**
     * Assignments, quizzes and anything else with a deadline that still needs
     * doing, from two weeks back (so a late one is not lost) onwards. Moodle
     * drops an item from this list once it is submitted.
     */
    static JSONArray todo(Context c) throws IOException, Refused, JSONException {
        String user = Vault.get(c, V_USER);
        if (user == null) throw new Refused("Not connected");
        String token = Vault.get(c, V_TOKEN);
        JSONArray events;
        if (token != null) {
            try {
                events = call(token, TODO, todoArgs()).optJSONArray("events");
            } catch (Refused e) {
                token = appToken(user, savedPassword(c));
                Vault.put(c, V_TOKEN, token);
                events = call(token, TODO, todoArgs()).optJSONArray("events");
            }
        } else {
            String cookie = Vault.get(c, V_COOKIE);
            try {
                if (cookie == null) throw new Expired();
                events = webTodo(cookie);
            } catch (Expired e) {
                Session s;
                try {
                    s = webLogin(user, savedPassword(c));
                } catch (Refused r) {
                    // Never try a refused password twice: Moodle locks accounts for that.
                    Vault.remove(c, V_PASS, V_COOKIE);
                    throw new Refused("The LMS no longer accepts your saved password. Connect the LMS again.");
                }
                Vault.put(c, V_COOKIE, s.cookie);
                try {
                    events = webTodo(s.cookie);
                } catch (Expired x) {
                    throw new IOException("The LMS signed in but did not answer");
                }
            }
        }
        return simplify(events);
    }

    private static String savedPassword(Context c) throws Refused {
        String pass = Vault.get(c, V_PASS);
        if (pass == null) throw new Refused("Connect the LMS again.");
        return pass;
    }

    private static Map<String, String> todoArgs() {
        Map<String, String> args = new LinkedHashMap<>();
        args.put("timesortfrom", String.valueOf(fromSeconds()));
        args.put("limitnum", "50");
        return args;
    }

    private static long fromSeconds() {
        return System.currentTimeMillis() / 1000 - 14 * 24 * 3600;
    }

    private static JSONArray simplify(JSONArray events) throws JSONException {
        JSONArray out = new JSONArray();
        if (events == null) return out;
        for (int i = 0; i < events.length(); i++) {
            JSONObject e = events.optJSONObject(i);
            if (e == null) continue;
            JSONObject course = e.optJSONObject("course");
            JSONObject action = e.optJSONObject("action");
            out.put(new JSONObject()
                    .put("id", e.optLong("id"))
                    .put("instance", e.optLong("instance"))
                    .put("module", e.optString("modulename", ""))
                    .put("name", e.optString("activityname", e.optString("name", "")))
                    .put("course", course == null ? "" : course.optString("fullname", course.optString("shortname", "")))
                    .put("due", e.optLong("timesort", e.optLong("timestart")))
                    .put("url", e.optString("url", ""))
                    .put("overdue", e.optBoolean("overdue", false))
                    .put("action", action == null ? "" : action.optString("name", "")));
        }
        return out;
    }

    // -------------------------------------------------------------------------
    // The app door: a web-service token.

    private static String appToken(String user, String pass) throws IOException, Refused, JSONException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("username", user);
        form.put("password", pass);
        form.put("service", "moodle_mobile_app");
        Net.Res r = Net.postForm(BASE + "/login/token.php", form, null);
        if (r.code == 404 || r.code == 403 || r.redirect()) throw new Refused("App sign-in is off", true);
        if (!r.ok()) throw new IOException("The LMS answered " + r.code);
        JSONObject j;
        try {
            j = new JSONObject(r.body);
        } catch (JSONException e) {
            // A page instead of JSON: the app door is not there at all.
            throw new Refused("App sign-in is off", true);
        }
        String token = j.optString("token", "");
        if (!token.isEmpty()) return token;
        String code = j.optString("errorcode", "");
        if ("invalidlogin".equals(code)) throw new Refused("Wrong username or password.");
        // Anything else (web services off, the app service off, SSO-only…) shuts only this door.
        throw new Refused("App sign-in is off (" + code + ")", true);
    }

    private static JSONObject call(String token, String fn, Map<String, String> args)
            throws IOException, Refused, JSONException {
        Map<String, String> form = new LinkedHashMap<>();
        form.put("wstoken", token);
        form.put("wsfunction", fn);
        form.put("moodlewsrestformat", "json");
        form.putAll(args);
        Net.Res r = Net.postForm(BASE + "/webservice/rest/server.php", form, null);
        if (!r.ok()) throw new IOException("The LMS answered " + r.code);
        String body = r.body.trim();
        if (body.startsWith("[")) return new JSONObject().put("list", new JSONArray(body));
        JSONObject j = new JSONObject(body);
        if (j.has("exception")) {
            String code = j.optString("errorcode", "");
            if ("invalidtoken".equals(code) || "accessexception".equals(code)) throw new Refused("Sign in to the LMS again.");
            throw new IOException(j.optString("message", code));
        }
        return j;
    }

    // -------------------------------------------------------------------------
    // The website door: the login form, then the page API the dashboard uses.

    private static final class Session {
        final String cookie;
        final String name;

        Session(String cookie, String name) {
            this.cookie = cookie;
            this.name = name;
        }
    }

    /** Cookies for one host, kept the way a browser would for a few requests. */
    private static final class Jar {
        private final Map<String, String> cookies = new LinkedHashMap<>();

        Jar() {}

        Jar(String header) {
            if (header == null) return;
            for (String part : header.split(";")) {
                int eq = part.indexOf('=');
                if (eq > 0) cookies.put(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
            }
        }

        void take(Net.Res r) {
            List<String> set = r.all("Set-Cookie");
            for (String line : set) {
                String pair = line.split(";", 2)[0];
                int eq = pair.indexOf('=');
                if (eq <= 0) continue;
                String name = pair.substring(0, eq).trim();
                String value = pair.substring(eq + 1).trim();
                boolean gone = value.isEmpty() || "deleted".equals(value) || line.toLowerCase().contains("max-age=0");
                if (gone) cookies.remove(name);
                else cookies.put(name, value);
            }
        }

        String header() {
            StringBuilder b = new StringBuilder();
            for (Map.Entry<String, String> e : cookies.entrySet()) {
                if (b.length() > 0) b.append("; ");
                b.append(e.getKey()).append('=').append(e.getValue());
            }
            return b.toString();
        }

        Map<String, String> headers() {
            Map<String, String> h = new HashMap<>();
            String v = header();
            if (!v.isEmpty()) h.put("Cookie", v);
            h.put("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8");
            h.put("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36");
            return h;
        }
    }

    private static Session webLogin(String user, String pass) throws IOException, Refused {
        Jar jar = new Jar();
        Net.Res page = follow(BASE + "/login/index.php", jar, false);
        String loginToken = first(LOGIN_TOKEN, page.body);

        Map<String, String> form = new LinkedHashMap<>();
        form.put("anchor", "");
        if (loginToken != null) form.put("logintoken", loginToken);
        form.put("username", user);
        form.put("password", pass);
        Map<String, String> h = jar.headers();
        h.put("Origin", BASE);
        h.put("Referer", BASE + "/login/index.php");
        Net.Res r = Net.postForm(BASE + "/login/index.php", form, h);
        jar.take(r);

        String where = r.header("Location");
        boolean in = r.redirect() && where != null
                && (where.contains("testsession=") || !where.contains("/login/"));
        if (!in) {
            String said = first(ERROR_BOX, r.body);
            if (said != null) said = said.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
            if (said != null && said.toLowerCase().contains("lock")) {
                throw new Refused("The LMS has locked your account for now: " + said);
            }
            throw new Refused("Wrong username or password.");
        }
        // Let Moodle finish its own sign-in checks, then read who it thinks this is.
        Net.Res home = follow(absolute(where), jar, true);
        String name = first(USER_NAME, home.body);
        return new Session(jar.header(), name == null ? "" : name.trim());
    }

    /** The to-do list through /lib/ajax/service.php, as the Timeline block asks for it. */
    private static JSONArray webTodo(String cookie) throws IOException, Expired, JSONException {
        Jar jar = new Jar(cookie);
        Net.Res my = follow(BASE + "/my/", jar, true);
        String sesskey = first(SESSKEY, my.body);
        if (sesskey == null) sesskey = first(SESSKEY_LINK, my.body);
        if (sesskey == null) throw new Expired();

        JSONObject args = new JSONObject()
                .put("timesortfrom", fromSeconds())
                .put("limitnum", 50);
        JSONArray req = new JSONArray().put(new JSONObject()
                .put("index", 0)
                .put("methodname", TODO)
                .put("args", args));
        Map<String, String> h = jar.headers();
        h.put("Accept", "application/json, text/javascript, */*; q=0.01");
        h.put("X-Requested-With", "XMLHttpRequest");
        h.put("Origin", BASE);
        h.put("Referer", BASE + "/my/");
        Net.Res r = Net.postJson(BASE + "/lib/ajax/service.php?sesskey=" + sesskey + "&info=" + TODO, req.toString(), h);
        if (r.redirect() || r.code == 401 || r.code == 403) throw new Expired();
        if (!r.ok()) throw new IOException("The LMS answered " + r.code);
        JSONArray answer = new JSONArray(r.body.trim());
        JSONObject one = answer.getJSONObject(0);
        if (one.optBoolean("error", false)) {
            JSONObject ex = one.optJSONObject("exception");
            String code = ex == null ? "" : ex.optString("errorcode", "");
            if (code.contains("login") || code.contains("sesskey") || code.contains("session")) throw new Expired();
            throw new IOException(ex == null ? "The LMS refused" : ex.optString("message", code));
        }
        JSONObject data = one.optJSONObject("data");
        return data == null ? new JSONArray() : data.optJSONArray("events");
    }

    /**
     * GET, following the LMS's own redirects (never to another site). With
     * `mustBeIn`, landing on the login page means the session is over.
     */
    private static Net.Res follow(String url, Jar jar, boolean mustBeIn) throws IOException {
        String at = url;
        for (int hop = 0; hop < 5; hop++) {
            Net.Res r = Net.get(at, jar.headers());
            jar.take(r);
            if (!r.redirect()) return r;
            String next = r.header("Location");
            if (next == null) return r;
            next = absolute(next);
            if (!next.startsWith(BASE + "/")) return r;
            if (mustBeIn && next.contains("/login/index.php") && !next.contains("testsession=")) {
                return new Net.Res(401, "", null);
            }
            at = next;
        }
        throw new IOException("The LMS kept redirecting");
    }

    private static String absolute(String location) {
        try {
            return new URL(new URL(BASE + "/"), location).toString();
        } catch (IOException e) {
            return location;
        }
    }

    private static String first(Pattern p, String text) {
        if (text == null) return null;
        Matcher m = p.matcher(text);
        return m.find() ? m.group(1) : null;
    }
}
