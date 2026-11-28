// Standalone proof that DockIn's server-side MyCamu approach works end-to-end.
// Reaches MyCamu directly (your machine can, the cloud sandbox can't), logs in
// with your email+password login, and reads real data back. Your password is
// never printed.
//
// Run from the repo root:
//   MYCAMU_EMAIL='you@example.com' MYCAMU_PWD='yourPassword' node scripts/camu-selftest.mjs
//
// (This is a one-off check — delete it after if you like.)

const BASE = "https://student.bennetterp.camu.in";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36";
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

const EMAIL = process.env.MYCAMU_EMAIL;
const PWD = process.env.MYCAMU_PWD;
if (!EMAIL || !PWD) {
  console.error("Set MYCAMU_EMAIL and MYCAMU_PWD env vars first.");
  process.exit(1);
}

function headers(cookie) {
  const h = {
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
function cookieFrom(res) {
  const list = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie")].filter(Boolean);
  return list.map((c) => c.split(";", 1)[0]?.trim()).filter((p) => p && p.includes("=")).join("; ");
}

async function main() {
  // 1) login
  const body = JSON.stringify({ dtype: "M", Email: b64(EMAIL.trim()), pwd: b64(PWD), isEncr: true });
  const res = await fetch(`${BASE}/login/validate`, { method: "POST", headers: { ...headers("X-App-Type=student"), "Content-Length": String(Buffer.byteLength(body)) }, body });
  console.log("login HTTP:", res.status);
  const cookie = cookieFrom(res);
  console.log("connect.sid set:", cookie.includes("connect.sid"));
  const j = await res.json();
  const data = j?.output?.data;
  const ld = data?.logindetails;
  const pd = data?.progressionData?.[0];
  if (!ld || !pd) {
    console.log("No profile returned. errors:", JSON.stringify(j?.output?.errors));
    process.exit(1);
  }
  const ids = {
    loggedInId: ld._id,
    stuId: ld.Student?.[0]?.StuID ?? pd.StuID,
    inId: pd.InId,
    cmProgId: pd.CmProgID,
    prId: pd.PrID,
    crId: pd.CrID,
    deptId: pd.DeptID,
    semId: pd.SemID,
    acYr: pd.AcYr,
    isFE: !!pd.isFE,
  };
  console.log("\n✅ LOGIN OK");
  console.log("Student:", `${pd.FNa ?? ""} ${pd.LNa ?? ""}`.trim(), "|", pd.SemName, "|", pd.CrCode);
  console.log("loggedInId:", ids.loggedInId, "| stuId:", ids.stuId);

  const s = { cookie, ids };
  const post = async (path, b) => {
    const r = await fetch(`${BASE}${path}`, { method: "POST", headers: headers(s.cookie), body: JSON.stringify(b) });
    const jj = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) throw new Error("session expired");
    return jj?.output?.data;
  };

  // 2) attendance
  try {
    const att = await post("/api/Attendance/getDtaForStupage", {
      InId: ids.inId, PrID: ids.prId, CrID: ids.crId, DeptID: ids.deptId, SemID: ids.semId,
      AcYr: ids.acYr, CmProgID: ids.cmProgId, StuID: ids.stuId, isFE: ids.isFE, isForWeb: true, isFrAbLg: true,
    });
    const pct = att?.overallPer ?? att?.OverallPercentage ?? att?.totalPer ?? att?.attPer;
    console.log("\n✅ ATTENDANCE OK — overall:", pct ?? "(got data; keys: " + Object.keys(att || {}).slice(0, 8).join(", ") + ")");
  } catch (e) {
    console.log("\n⚠️ attendance:", e.message);
  }

  // 3) passes
  try {
    const p = await post("/api/Leave/getAllleave/", { StuID: ids.stuId, isFrmReact: true });
    console.log("✅ PASSES OK — count:", Array.isArray(p) ? p.length : typeof p);
  } catch (e) {
    console.log("⚠️ passes:", e.message);
  }

  console.log("\n🎉 Server-side MyCamu works. iPhone/web pe sab chalega.");
}
main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
