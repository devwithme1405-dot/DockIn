package com.dockin.student;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Lms.resolveAssign against a pretend Moodle: whichever id the task carries
 * (the real one, a page id, a stale one), the hand-in must go to the real
 * assignment, and an id the LMS does not know must never be used.
 */
public final class LmsResolveTest {

    /** A tiny Moodle: assignments (id, cmid, name) the student can see, plus a to-do list. */
    static final class Fake implements Lms.Ws {
        final long[][] assigns; // {id, cmid}
        final String[] names;
        boolean listAllowed = true;
        boolean cmAllowed = true;
        boolean statusAllowed = true;
        final List<String> calls = new ArrayList<>();

        Fake(long[][] assigns, String[] names) {
            this.assigns = assigns;
            this.names = names;
        }

        @Override
        public JSONObject call(String fn, Map<String, String> args) throws IOException, Lms.Refused, JSONException {
            calls.add(fn + args);
            switch (fn) {
                case "core_course_get_course_module": {
                    if (!cmAllowed) throw new IOException("Access control exception [accessexception]");
                    long cm = Long.parseLong(args.get("cmid"));
                    for (long[] a : assigns) {
                        if (a[1] == cm) {
                            return new JSONObject().put("cm", new JSONObject().put("modname", "assign").put("instance", a[0]));
                        }
                    }
                    throw new IOException("Can't find data record in database table course_modules. [invalidrecord]");
                }
                case "mod_assign_get_assignments": {
                    if (!listAllowed) throw new IOException("Access control exception [accessexception]");
                    JSONArray list = new JSONArray();
                    for (int i = 0; i < assigns.length; i++) {
                        list.put(new JSONObject().put("id", assigns[i][0]).put("cmid", assigns[i][1]).put("name", names[i]));
                    }
                    return new JSONObject().put("courses", new JSONArray().put(new JSONObject().put("assignments", list)));
                }
                case "mod_assign_get_submission_status": {
                    if (!statusAllowed) throw new IOException("Access control exception [accessexception]");
                    long id = Long.parseLong(args.get("assignid"));
                    for (long[] a : assigns) if (a[0] == id) return new JSONObject().put("lastattempt", new JSONObject());
                    throw new IOException("Can't find data record in database table assign. [invalidrecord]");
                }
                case "core_calendar_get_action_events_by_timesort": {
                    JSONArray ev = new JSONArray();
                    for (int i = 0; i < assigns.length; i++) {
                        ev.put(new JSONObject().put("modulename", "assign").put("instance", assigns[i][0])
                                .put("activityname", names[i])
                                .put("url", "https://lms.bennett.edu.in/mod/assign/view.php?id=" + assigns[i][1]));
                    }
                    return new JSONObject().put("events", ev);
                }
                default:
                    throw new IOException("unknown " + fn);
            }
        }
    }

    static int failed = 0;

    static void check(String what, long got, long want) {
        if (got == want) System.out.println("ok   " + what);
        else {
            failed++;
            System.out.println("FAIL " + what + ": got " + got + ", want " + want);
        }
    }

    static void checkS(String what, String got, String want) {
        if (got == null ? want == null : got.equals(want)) System.out.println("ok   " + what);
        else {
            failed++;
            System.out.println("FAIL " + what + ": got " + got + ", want " + want);
        }
    }

    static String startsWith(String s, String head) {
        return s != null && s.startsWith(head) ? "yes" : String.valueOf(s);
    }

    /** One assignment (id 502) with these file settings, and this student's submission state. */
    static Lms.Ws settings(String types, String filesOn, long cutoff, long maxBytes, boolean canEdit, String status) {
        return (fn, args) -> {
            if ("mod_assign_get_assignments".equals(fn)) {
                JSONArray cfg = new JSONArray()
                        .put(new JSONObject().put("plugin", "file").put("subtype", "assignsubmission").put("name", "enabled").put("value", filesOn))
                        .put(new JSONObject().put("plugin", "file").put("subtype", "assignsubmission").put("name", "filetypeslist").put("value", types))
                        .put(new JSONObject().put("plugin", "file").put("subtype", "assignsubmission").put("name", "maxsubmissionsizebytes").put("value", String.valueOf(maxBytes)));
                JSONObject a = new JSONObject().put("id", 502L).put("cmid", 9002L).put("cutoffdate", cutoff).put("configs", cfg);
                return new JSONObject().put("courses", new JSONArray().put(new JSONObject().put("assignments", new JSONArray().put(a))));
            }
            if ("mod_assign_get_submission_status".equals(fn)) {
                return new JSONObject().put("lastattempt", new JSONObject().put("canedit", canEdit)
                        .put("submission", new JSONObject().put("status", status)));
            }
            throw new IOException("unknown " + fn);
        };
    }

    static Fake moodle() {
        return new Fake(new long[][] {{501, 9001}, {502, 9002}, {503, 9003}},
                new String[] {"Assignment 9", "assignment 10", "Lab report"});
    }

    public static void main(String[] a) throws Exception {
        check("real id + page link", Lms.resolveAssign(moodle(), 502, 9002, "assignment 10"), 502);
        check("real id, no link", Lms.resolveAssign(moodle(), 502, 0, null), 502);
        check("page id given as the id", Lms.resolveAssign(moodle(), 9002, 0, null), 502);
        check("stale id, right link", Lms.resolveAssign(moodle(), 777, 9002, null), 502);
        check("stale id, no link, title", Lms.resolveAssign(moodle(), 777, 0, "  Assignment   10 "), 502);

        Fake noList = moodle();
        noList.listAllowed = false;
        check("no list allowed, link", Lms.resolveAssign(noList, 777, 9002, null), 502);
        check("no list allowed, page id given", Lms.resolveAssign(noList, 9003, 0, null), 503);
        check("no list allowed, title via to-do", Lms.resolveAssign(noList, 777, 0, "lab report"), 503);

        Fake noCm = moodle();
        noCm.cmAllowed = false;
        check("no cm lookup, list by link", Lms.resolveAssign(noCm, 777, 9001, null), 501);

        Fake blind = moodle();
        blind.listAllowed = false;
        blind.cmAllowed = false;
        blind.statusAllowed = false;
        check("LMS answers nothing: given id kept", Lms.resolveAssign(blind, 502, 0, null), 502);

        // Two assignments with the same name: the title alone must not pick one.
        Fake twins = new Fake(new long[][] {{601, 9101}, {602, 9102}}, new String[] {"Assignment", "Assignment"});
        try {
            long got = Lms.resolveAssign(twins, 777, 0, "Assignment");
            failed++;
            System.out.println("FAIL same-name twins: picked " + got);
        } catch (Lms.NoSuchAssignment e) {
            System.out.println("ok   same-name twins: refused, nothing uploaded");
        }

        try {
            long got = Lms.resolveAssign(moodle(), 777, 0, "Nothing like this");
            failed++;
            System.out.println("FAIL unknown assignment: picked " + got);
        } catch (Lms.NoSuchAssignment e) {
            System.out.println("ok   unknown assignment: clear error, nothing uploaded");
        }

        check("Lms.cmidOf link", Lms.cmidOf("https://lms.bennett.edu.in/mod/assign/view.php?action=editsubmission&id=42"), 42);
        check("Lms.cmidOf other", Lms.cmidOf("https://lms.bennett.edu.in/mod/quiz/view.php?id=42"), 0);

        // --- Will the LMS take this file? Asked before uploading.
        checkS("open, pdf allowed", Lms.cannotTake(settings(".pdf,.docx", "1", 0, 0, true, "new"), 502, "a.pdf", 1000), null);
        checkS("docx where only pdf", Lms.cannotTake(settings(".pdf", "1", 0, 0, true, "new"), 502, "a.docx", 1000),
                "The LMS only takes .pdf files for this assignment. Choose PDF in DockIn and submit again.");
        checkS("group type: let the LMS judge", Lms.cannotTake(settings("document", "1", 0, 0, true, "new"), 502, "a.zip", 1000), null);
        checkS("closed by cut-off", startsWith(Lms.cannotTake(settings("", "1", System.currentTimeMillis() / 1000 - 60, 0, true, "new"), 502, "a.pdf", 10), "The LMS has closed"), "yes");
        checkS("files off", startsWith(Lms.cannotTake(settings("", "0", 0, 0, true, "new"), 502, "a.pdf", 10), "This assignment doesn't take a file"), "yes");
        checkS("too big", startsWith(Lms.cannotTake(settings("", "1", 0, 1048576, true, "new"), 502, "a.pdf", 2_000_000), "The LMS takes files up to 1 MB"), "yes");
        checkS("already submitted, no changes", startsWith(Lms.cannotTake(settings("", "1", 0, 0, false, "submitted"), 502, "a.pdf", 10), "You've already submitted"), "yes");

        // --- Moodle's save warning: the reason is in "item".
        JSONArray w = new JSONArray().put(new JSONObject().put("item", "Nothing was submitted").put("itemid", 502)
                .put("warningcode", "couldnotsavesubmission").put("message", "Could not save submission."));
        checkS("save refusal shows the reason", Lms.saveRefusal(w), "The LMS didn't save it: Nothing was submitted.");
        JSONArray bare = new JSONArray().put(new JSONObject().put("item", "assignment").put("warningcode", "couldnotsavesubmission")
                .put("message", "Could not save submission."));
        checkS("save refusal without a reason", startsWith(Lms.saveRefusal(bare), "The LMS didn't save it (couldnotsavesubmission)"), "yes");

        if (failed > 0) {
            System.out.println(failed + " failed");
            System.exit(1);
        }
        System.out.println("lms resolve: all good");
    }
}
