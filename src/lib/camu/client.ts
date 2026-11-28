/**
 * Server-side MyCamu client — the whole MyCamu conversation from DockIn's own
 * server instead of the phone. This is what lets iPhone (and any browser) do
 * outpass, attendance, timetable, mess and self-approval: the phone asks DockIn,
 * DockIn's server talks to MyCamu (no CORS, no native plugin needed).
 *
 * MyCamu's student account signs in only with Microsoft; its *second* login —
 * a username/password account MyCamu labels "parent" — does everything a student
 * needs (make a pass, approve it, read attendance) and signs in with an email +
 * password, so a server can replay it. That is the login used here.
 *
 * Nothing is guessed: the login request and every API body were captured from
 * MyCamu's own site (28 Nov 2026) and mirror the native app's working calls.
 * Server-only — never import into a client component.
 */

const BASE = "https://student.bennetterp.camu.in";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";

export interface CamuIds {
  /** The signed-in login's own id — sent as loggedInId with a pass / approval. */
  loggedInId: string;
  /** The student this login belongs to — PerId on a pass, PerId on an approval. */
  stuId: string;
  inId: string;
  cmProgId: string;
  prId: string;
  crId: string;
  deptId: string;
  semId: string;
  acYr: string;
  isFE: boolean;
  /** The student's display name (not the login/parent name). */
  name: string;
  /** "Semester - 3", for showing which term the data is from. */
  semName: string;
}

export interface CamuSession {
  /** The Cookie header value to send with every follow-up call. */
  cookie: string;
  ids: CamuIds;
}

export class CamuError extends Error {
  constructor(
    message: string,
    readonly kind: "credentials" | "expired" | "network" | "camu" = "camu",
  ) {
    super(message);
    this.name = "CamuError";
  }
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** The one Cookie header built from a login response's Set-Cookie values. */
function cookieFrom(res: Response): string {
  const list: string[] =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as { getSetCookie: () => string[] }).getSetCookie()
      : res.headers.get("set-cookie")
        ? [res.headers.get("set-cookie") as string]
        : [];
  const pairs: string[] = [];
  for (const raw of list) {
    const pair = raw.split(";", 1)[0]?.trim();
    if (pair && pair.includes("=")) pairs.push(pair);
  }
  return pairs.join("; ");
}

function baseHeaders(cookie?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    appVersion: "v2",
    clientTzOfst: "330",
    Origin: BASE,
    Referer: `${BASE}/v2/`,
    "User-Agent": UA,
    Accept: "application/json, text/plain, */*",
  };
  if (cookie) h.Cookie = cookie;
  return h;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** MyCamu wraps everything as {output:{data, errors}} — pull out data, raise on errors. */
function output(j: Record<string, unknown>): unknown {
  const out = (j as { output?: { data?: unknown; errors?: unknown } }).output;
  if (out?.errors) {
    const e = out.errors;
    const msg = typeof e === "string" ? e : Array.isArray(e) ? String(e[0]) : JSON.stringify(e);
    throw new CamuError(msg || "MyCamu refused the request.", "camu");
  }
  return out?.data;
}

// ---------------------------------------------------------------- login

/**
 * Signs in with the email + password MyCamu login and returns the session
 * cookie plus every id the other calls need. Email and password go base64-encoded
 * with isEncr:true, exactly as MyCamu's own page sends them.
 */
export async function login(email: string, password: string): Promise<CamuSession> {
  if (!email || !password) throw new CamuError("Enter your MyCamu email and password.", "credentials");
  const body = JSON.stringify({ dtype: "M", Email: b64(email.trim()), pwd: b64(password), isEncr: true });

  let res: Response;
  try {
    res = await fetch(`${BASE}/login/validate`, { method: "POST", headers: { ...baseHeaders("X-App-Type=student"), "Content-Length": String(Buffer.byteLength(body)) }, body });
  } catch (e) {
    throw new CamuError(`Couldn't reach MyCamu: ${(e as Error).message}`, "network");
  }
  if (res.status === 401 || res.status === 403) throw new CamuError("MyCamu rejected that email or password.", "credentials");
  if (!res.ok) throw new CamuError(`MyCamu answered ${res.status}.`, "camu");

  const cookie = cookieFrom(res);
  if (!cookie.includes("connect.sid")) throw new CamuError("MyCamu didn't start a session — check the email and password.", "credentials");

  const j = await parseJson(res);
  const data = (j as { output?: { data?: Record<string, unknown> } }).output?.data as Record<string, unknown> | undefined;
  const ld = data?.logindetails as Record<string, unknown> | undefined;
  const pd = (data?.progressionData as Record<string, unknown>[] | undefined)?.[0];
  if (!ld || !pd) {
    // A wrong password still returns 200 with an error in the body.
    output(j);
    throw new CamuError("MyCamu didn't return a profile — the login may be wrong.", "credentials");
  }

  const student = (ld.Student as Record<string, unknown>[] | undefined)?.[0];
  const ids: CamuIds = {
    loggedInId: String(ld._id ?? ""),
    stuId: String(student?.StuID ?? pd.StuID ?? ""),
    inId: String(pd.InId ?? ld.InId ?? ""),
    cmProgId: String(pd.CmProgID ?? ""),
    prId: String(pd.PrID ?? ""),
    crId: String(pd.CrID ?? ""),
    deptId: String(pd.DeptID ?? ""),
    semId: String(pd.SemID ?? ""),
    acYr: String(pd.AcYr ?? ""),
    isFE: !!pd.isFE,
    name: `${pd.FNa ?? ""} ${pd.LNa ?? ""}`.trim(),
    semName: String(pd.SemName ?? ""),
  };
  if (!ids.loggedInId || !ids.stuId) throw new CamuError("MyCamu didn't return the ids a pass needs.", "camu");
  return { cookie, ids };
}

// ---------------------------------------------------------------- calls

async function post(s: CamuSession, path: string, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { method: "POST", headers: baseHeaders(s.cookie), body: JSON.stringify(body) });
  } catch (e) {
    throw new CamuError(`Couldn't reach MyCamu: ${(e as Error).message}`, "network");
  }
  if (res.status === 401 || res.status === 403) throw new CamuError("MyCamu session ended.", "expired");
  if (!res.ok) throw new CamuError(`MyCamu answered ${res.status}.`, "camu");
  return output(await parseJson(res));
}

async function get(s: CamuSession, path: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { headers: baseHeaders(s.cookie) });
  } catch (e) {
    throw new CamuError(`Couldn't reach MyCamu: ${(e as Error).message}`, "network");
  }
  if (res.status === 401 || res.status === 403) throw new CamuError("MyCamu session ended.", "expired");
  if (!res.ok) throw new CamuError(`MyCamu answered ${res.status}.`, "camu");
  return output(await parseJson(res));
}

const OBJECT_ID = /^[a-f0-9]{24}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

// ---------------------------------------------------------------- outpass

export interface DayOutInput {
  day: string; // YYYY-MM-DD
  from: string; // HH:MM (>= 06:00)
  to: string; // HH:MM (<= 19:00)
  reason: string;
}

/** Makes a day-out gate pass (mirrors Camu.dayOutBody). */
export async function createDayOut(s: CamuSession, { day, from, to, reason }: DayOutInput): Promise<unknown> {
  if (!DAY.test(day) || !TIME.test(from) || !TIME.test(to)) throw new CamuError("Pick a date and both times.", "credentials");
  if (from < "06:00" || to > "19:00" || from >= to) throw new CamuError("A day out runs between 6:00 am and 7:00 pm.", "credentials");
  const why = (reason || "").trim();
  if (!why || why.length > 200) throw new CamuError("Give a reason.", "credentials");
  const midnight = `${day}T00:00:00.000Z`;
  return post(s, "/api/Leave/crtLv", {
    PerTy: "Student",
    PerId: s.ids.stuId,
    PerNm: s.ids.name,
    InId: s.ids.inId,
    HstleReq: "true",
    LvTy: "Leave",
    Rson: why,
    PtAb: "",
    Sson: "",
    ToDt: midnight,
    FrDt: midnight,
    periods: [],
    Attachments: [],
    GateOutPass: true,
    passTy: "DOP",
    loggedInId: s.ids.loggedInId,
    frdt: `${day}T${from}:00Z`,
    todt: `${day}T${to}:00Z`,
    rson: why,
    atcmnt: [],
    timezoneOffSet: 330,
  });
}

export interface LeaveInput {
  fromDay: string;
  from: string;
  toDay: string;
  to: string;
  reason: string;
  fileName: string;
  attId: string;
  atchId: string;
}

/** Makes a multi-day leave gate pass with the required mail-screenshot attachment. */
export async function createLeave(s: CamuSession, i: LeaveInput): Promise<unknown> {
  if (!DAY.test(i.fromDay) || !DAY.test(i.toDay) || !TIME.test(i.from) || !TIME.test(i.to)) throw new CamuError("Pick both dates and both times.", "credentials");
  if (i.from < "06:00" || i.from > "19:00" || i.to < "06:00" || i.to > "19:00") throw new CamuError("Leave times are between 6:00 am and 7:00 pm.", "credentials");
  if (i.toDay + i.to <= i.fromDay + i.from) throw new CamuError("It ends before it starts.", "credentials");
  const why = (i.reason || "").trim();
  if (!why || why.length > 200) throw new CamuError("Give a reason.", "credentials");
  if (!i.attId || !i.atchId) throw new CamuError("A leave needs the mail screenshot.", "credentials");
  return post(s, "/api/Leave/crtLv", {
    PerTy: "Student",
    PerId: s.ids.stuId,
    PerNm: s.ids.name,
    InId: s.ids.inId,
    HstleReq: "true",
    LvTy: "Leave",
    Rson: why,
    PtAb: "",
    Sson: "",
    ToDt: `${i.toDay}T00:00:00.000Z`,
    FrDt: `${i.fromDay}T00:00:00.000Z`,
    periods: [],
    Attachments: [{ AttchName: i.fileName, AttchID: i.attId }],
    GateOutPass: true,
    passTy: "LEAVE_OUT_PASS",
    loggedInId: s.ids.loggedInId,
    frdt: `${i.fromDay}T${i.from}:00Z`,
    todt: `${i.toDay}T${i.to}:00Z`,
    rson: why,
    atcmnt: [{ atchNm: i.fileName, atchId: i.atchId }],
    timezoneOffSet: 330,
  });
}

/** Approves a pass the way MyCamu's own Approve button does (roll:parent). */
export async function approvePass(s: CamuSession, passId: string): Promise<string> {
  if (!OBJECT_ID.test(passId)) throw new CamuError("That pass can't be approved.", "credentials");
  const data = (await post(s, "/api/gatepasses/change-gatepasses-status", {
    id: passId,
    roll: "parent",
    action: "Approve",
    PerId: s.ids.stuId,
    loggedInId: s.ids.loggedInId,
  })) as { code?: string } | undefined;
  return data?.code ?? "approved";
}

/** Cancels a pass by its id. */
export async function cancelPass(s: CamuSession, passId: string): Promise<unknown> {
  if (!OBJECT_ID.test(passId)) throw new CamuError("That pass can't be cancelled.", "credentials");
  return get(s, `/api/gatepasses/cancelstatus/${passId}`);
}

/** Every gate pass / leave for this student, as MyCamu lists them. */
export async function passes(s: CamuSession): Promise<unknown> {
  return post(s, "/api/Leave/getAllleave/", { StuID: s.ids.stuId, isFrmReact: true });
}

// ---------------------------------------------------------------- read-only

/** Overall and per-subject attendance. */
export async function attendance(s: CamuSession): Promise<unknown> {
  return post(s, "/api/Attendance/getDtaForStupage", {
    InId: s.ids.inId,
    PrID: s.ids.prId,
    CrID: s.ids.crId,
    DeptID: s.ids.deptId,
    SemID: s.ids.semId,
    AcYr: s.ids.acYr,
    CmProgID: s.ids.cmProgId,
    StuID: s.ids.stuId,
    isFE: s.ids.isFE,
    isForWeb: true,
    isFrAbLg: true,
  });
}

/** Every class of one subject this semester. */
export async function subjectHistory(s: CamuSession, subjectId: string, attTypes: string[] = ["PerAtt"]): Promise<unknown> {
  return post(s, "/api/getAttendanceByAttTypAndSubj", {
    CmProgID: s.ids.cmProgId,
    isFE: s.ids.isFE,
    AttenTy: attTypes,
    SubID: subjectId,
  });
}

/** The week's timetable between two ISO datetimes. */
export async function timetable(s: CamuSession, from: string, to: string): Promise<unknown> {
  return post(s, "/api/Timetable/get", {
    PrID: s.ids.prId,
    CrID: s.ids.crId,
    AcYr: s.ids.acYr,
    DeptID: s.ids.deptId,
    SemID: s.ids.semId,
    start: from,
    end: to,
    schdlTyp: "showCurWeek",
    isShowCancelledPeriod: true,
    isFromTt: true,
  });
}

/** Today's mess menu (no body — the session identifies the student). */
export async function messMenu(s: CamuSession): Promise<unknown> {
  return post(s, "/api/mess-management/get-student-menu-list", {});
}

/** The student's reusable cafeteria QR. */
export async function messQr(s: CamuSession): Promise<unknown> {
  return post(s, "/api/mess-management/generate-permanent-qr-code", {});
}
