package com.dockin.student;

import org.json.JSONObject;

/**
 * The Day Out body DockIn sends must match what MyCamu's own form sent
 * (captured 26 Nov 2026), field for field, and refuse a bad day out.
 */
public class PassBodyTest {
    static int fails = 0;

    static void eq(String what, Object want, Object got) {
        if (!String.valueOf(want).equals(String.valueOf(got))) {
            fails++;
            System.out.println("FAIL " + what + ": want " + want + ", got " + got);
        }
    }

    static void refuses(String what, String day, String from, String to, String reason) throws Exception {
        try {
            Camu.dayOutBody(new JSONObject(), "L", day, from, to, reason);
            fails++;
            System.out.println("FAIL " + what + ": accepted");
        } catch (IllegalArgumentException e) {
            // right
        }
    }

    public static void main(String[] a) throws Exception {
        JSONObject id = new JSONObject()
                .put("StuID", "6899a3e84245c98c34c20825")
                .put("InId", "663474b11dd0e9412a1f793f")
                .put("name", "SACHIN KUMAR");
        JSONObject b = Camu.dayOutBody(id, "6899a3e94245c98c34c20828", "2026-12-03", "07:00", "19:00", " Outing ");
        // From MyCamu's own request, with the dates made to agree.
        JSONObject camu = new JSONObject()
                .put("PerTy", "Student").put("PerId", "6899a3e84245c98c34c20825").put("PerNm", "SACHIN KUMAR")
                .put("InId", "663474b11dd0e9412a1f793f").put("HstleReq", "true").put("LvTy", "Leave").put("Rson", "Outing")
                .put("PtAb", "").put("Sson", "").put("ToDt", "2026-12-03T00:00:00.000Z").put("FrDt", "2026-12-03T00:00:00.000Z")
                .put("periods", "[]").put("Attachments", "[]").put("GateOutPass", true).put("passTy", "DOP")
                .put("loggedInId", "6899a3e94245c98c34c20828").put("frdt", "2026-12-03T07:00:00Z").put("todt", "2026-12-03T19:00:00Z")
                .put("rson", "Outing").put("atcmnt", "[]").put("timezoneOffSet", 330);
        java.util.Iterator<String> keys = camu.keys();
        int n = 0;
        while (keys.hasNext()) {
            String k = keys.next();
            n++;
            Object got = b.opt(k);
            if (got instanceof org.json.JSONArray) got = ((org.json.JSONArray) got).length() == 0 ? "[]" : "[…]";
            eq(k, camu.opt(k), got);
        }
        eq("field count", n, b.length());
        refuses("before 6am", "2026-12-03", "05:30", "10:00", "x");
        refuses("after 7pm", "2026-12-03", "10:00", "19:30", "x");
        refuses("back before out", "2026-12-03", "15:00", "14:00", "x");
        refuses("no reason", "2026-12-03", "10:00", "12:00", "  ");
        refuses("bad date", "3 Dec", "10:00", "12:00", "x");
        // Leave Out Pass, against MyCamu's own request of 27 Nov 2026.
        JSONObject v = new JSONObject().put("StuID", "6899a90f4245c98c34c2201d").put("InId", "663474b11dd0e9412a1f793f").put("name", "Vaibhav .");
        JSONObject lb = Camu.leaveBody(v, "6899a90f4245c98c34c22020", "2026-12-03", "14:00", "2026-12-11", "19:00", "Home ",
                "IMG-20261127-WA0001.jpg", "6b091aec7d05ddfe316bb467", "6b091aed89a02425b5d39b0c");
        String[][] want = {
                {"PerTy", "Student"}, {"PerId", "6899a90f4245c98c34c2201d"}, {"PerNm", "Vaibhav ."}, {"InId", "663474b11dd0e9412a1f793f"},
                {"HstleReq", "true"}, {"LvTy", "Leave"}, {"Rson", "Home"}, {"PtAb", ""}, {"Sson", ""},
                {"ToDt", "2026-12-11T00:00:00.000Z"}, {"FrDt", "2026-12-03T00:00:00.000Z"}, {"GateOutPass", "true"},
                {"passTy", "LEAVE_OUT_PASS"}, {"loggedInId", "6899a90f4245c98c34c22020"},
                {"frdt", "2026-12-03T14:00:00Z"}, {"todt", "2026-12-11T19:00:00Z"}, {"rson", "Home"}, {"timezoneOffSet", "330"},
        };
        for (String[] w : want) eq("leave " + w[0], w[1], lb.opt(w[0]));
        eq("leave field count", want.length + 3, lb.length()); // + periods, Attachments, atcmnt = 21, as captured
        JSONObject att = ((org.json.JSONArray) lb.opt("Attachments")).optJSONObject(0);
        eq("Attachments name", "IMG-20261127-WA0001.jpg", att.optString("AttchName"));
        eq("Attachments id", "6b091aec7d05ddfe316bb467", att.optString("AttchID"));
        JSONObject at2 = ((org.json.JSONArray) lb.opt("atcmnt")).optJSONObject(0);
        eq("atcmnt name", "IMG-20261127-WA0001.jpg", at2.optString("atchNm"));
        eq("atcmnt id", "6b091aed89a02425b5d39b0c", at2.optString("atchId"));
        try {
            Camu.checkLeave("2026-12-03", "14:00", "2026-12-11", "20:00", "x");
            fails++;
            System.out.println("FAIL leave after 7pm accepted");
        } catch (IllegalArgumentException e) {
            // right
        }
        try {
            Camu.checkLeave("2026-12-11", "14:00", "2026-12-03", "19:00", "x");
            fails++;
            System.out.println("FAIL leave ending before start accepted");
        } catch (IllegalArgumentException e) {
            // right
        }
        Camu.checkLeave("2026-11-27", "14:00", "2026-12-03", "07:00", "Home");

        // MyCamu's list decides whether a pass was made.
        org.json.JSONArray list = new org.json.JSONArray()
                .put(new JSONObject().put("_id", "rej").put("passTyCode", "DOP").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T19:00:00.000Z").put("status", "REJ"))
                .put(new JSONObject().put("_id", "leave").put("passTyCode", "LEAVE_OUT_PASS").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T19:00:00.000Z"))
                .put(new JSONObject().put("_id", "other").put("passTyCode", "DOP").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T18:00:00.000Z").put("status", "SUB"))
                .put(new JSONObject().put("_id", "mine").put("passTyCode", "DOP").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T19:00:00.000Z").put("status", "SUB").put("prntAp", "SUB"));
        JSONObject f = Camu.findDayOut(list, "2026-11-27", "17:00", "19:00");
        eq("finds the matching day out", "mine", f == null ? null : f.optString("_id"));
        eq("other day: none", null, Camu.findDayOut(list, "2026-11-28", "17:00", "19:00"));
        org.json.JSONArray ll = new org.json.JSONArray()
                .put(new JSONObject().put("_id", "lo").put("passTyCode", "LEAVE_OUT_PASS").put("frdt", "2026-12-03T14:00:00.000Z").put("todt", "2026-12-11T19:00:00.000Z").put("status", "SUB"));
        JSONObject lf = Camu.findLeaveOut(ll, "2026-12-03", "14:00", "2026-12-11", "19:00");
        eq("finds the leave", "lo", lf == null ? null : lf.optString("_id"));
        System.out.println(fails == 0 ? "Day Out and Leave Out bodies match MyCamu's form." : fails + " problem(s)");
        System.exit(fails == 0 ? 0 : 1);
    }
}
