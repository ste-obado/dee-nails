export function money(value, currency = "KES") {
  return `${currency} ${Number(value).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

// "13:30" -> "1:30 PM"
export function clock(hhmm) {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// Build "YYYY-MM-DD" from LOCAL date parts. (toISOString() converts to UTC and
// can land on the wrong day.)
export function toISODate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function longDate(iso) {
  return parseISODate(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

// Backend weekdays run 0 = Monday ... 6 = Sunday; JS getDay() is 0 = Sunday.
export function backendWeekday(d) {
  return (d.getDay() + 6) % 7;
}

// "2026-11-02T12:00:00" -> { date: "2026-11-02", time: "12:00" }
export function splitDateTime(iso) {
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// "Open today 9:00 AM to 6:00 PM" / "Closed today" from /schedule/info
export function todayHours(info, now = new Date()) {
  const row = info?.working_hours?.find((h) => h.weekday === backendWeekday(now));
  if (!row || !row.is_open) return "Closed today";
  return `Open today ${clock(row.open_time)} to ${clock(row.close_time)}`;
}
