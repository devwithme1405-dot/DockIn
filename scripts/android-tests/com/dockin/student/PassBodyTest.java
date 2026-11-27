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
        // MyCamu's list decides whether a pass was made.
        org.json.JSONArray list = new org.json.JSONArray()
                .put(new JSONObject().put("_id", "rej").put("passTyCode", "DOP").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T19:00:00.000Z").put("status", "REJ"))
                .put(new JSONObject().put("_id", "leave").put("passTyCode", "LEAVE_OUT_PASS").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T19:00:00.000Z"))
                .put(new JSONObject().put("_id", "other").put("passTyCode", "DOP").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T18:00:00.000Z").put("status", "SUB"))
                .put(new JSONObject().put("_id", "mine").put("passTyCode", "DOP").put("frdt", "2026-11-27T17:00:00.000Z").put("todt", "2026-11-27T19:00:00.000Z").put("status", "SUB").put("prntAp", "SUB"));
        JSONObject f = Camu.findDayOut(list, "2026-11-27", "17:00", "19:00");
        eq("finds the matching day out", "mine", f == null ? null : f.optString("_id"));
        eq("other day: none", null, Camu.findDayOut(list, "2026-11-28", "17:00", "19:00"));
        System.out.println(fails == 0 ? "Day Out body matches MyCamu's form." : fails + " problem(s)");
        System.exit(fails == 0 ? 0 : 1);
    }
}
