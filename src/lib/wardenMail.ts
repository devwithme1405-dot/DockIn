/**
 * The mail a leave out pass needs: a note to the hostel warden, written for the
 * student so they only have to send it and screenshot it. DockIn can't make the
 * screenshot, but it can write the mail and open it ready to send.
 */

/** Where the leave-out mail always goes. */
export const WARDEN_EMAIL = "hostel.warden@bennett.edu.in";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-04" → "4 Nov 2026". */
export function mailDate(iso: string): string {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1] ?? m} ${y}`;
}

/** "14:30" → "2:30 PM". */
export function mailTime(hm: string): string {
  const [h, mn] = (hm || "").split(":").map(Number);
  if (Number.isNaN(h)) return hm;
  const ap = h < 12 ? "AM" : "PM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(Number.isNaN(mn) ? 0 : mn).padStart(2, "0")} ${ap}`;
}

export interface WardenMailInput {
  name: string;
  enrollment: string;
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
}

export function wardenMailBody(o: WardenMailInput): string {
  const who = [o.name.trim(), o.enrollment.trim()].filter(Boolean).join(" ") || "my ward";
  return `Dear Warden,

Please allow my ward ${who} from University premises from ${mailDate(o.fromDate)}, ${mailTime(o.fromTime)} to ${mailDate(o.toDate)}, ${mailTime(o.toTime)}.

I am fully aware of their outing activity.

Thanks`;
}

export function wardenMailSubject(o: Pick<WardenMailInput, "name" | "enrollment">): string {
  const who = [o.name.trim(), o.enrollment.trim()].filter(Boolean).join(" ");
  return who ? `Outing permission — ${who}` : "Outing permission";
}

/** The mailto: link that opens the phone's mail app with it all filled in. */
export function wardenMailto(o: WardenMailInput): string {
  return `mailto:${WARDEN_EMAIL}?subject=${encodeURIComponent(wardenMailSubject(o))}&body=${encodeURIComponent(wardenMailBody(o))}`;
}
