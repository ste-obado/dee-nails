export function money(value, currency = "KES") {
  return `${currency} ${Number(value).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

export function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
}

// "13:30" or "13:30:00" -> "1:30 PM"
export function clock(hhmm) {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const pad = (n) => String(n).padStart(2, "0");

// Build "YYYY-MM-DD" from LOCAL date parts (toISOString() would convert to UTC
// and can land on the wrong day).
export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// Monday of the week containing `iso`
export function mondayOf(iso) {
  const d = parseISODate(iso);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export function longDate(iso) {
  return parseISODate(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function shortDate(iso) {
  return parseISODate(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

// "2026-11-02T12:00:00" -> { date: "2026-11-02", time: "12:00" }
export function splitDateTime(iso) {
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
