import { addDays, toISODate } from "./format";

const PREFS_KEY = "dee_headsup_prefs";
const DISMISS_KEY = "dee_headsup_dismissed";
const DEFAULT_PREFS = { enabled: true, mode: "auto" }; // mode: auto | today | tomorrow
const EVENING_HOUR = 17;

export function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // private mode: the choice just won't be remembered
  }
}

// "Today:2030-01-07" -- a dismissal only hides that one heads-up, so tomorrow's
// shows up again on its own
export const headsUpKey = (pick) => `${pick.label}:${pick.date}`;

export function loadDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) || "";
  } catch {
    return "";
  }
}

export function saveDismissed(key) {
  try {
    localStorage.setItem(DISMISS_KEY, key);
  } catch {
    // ignore
  }
}

/**
 * Decide what, if anything, to show.
 *
 *  - "today"    -> what's left of today's appointments
 *  - "tomorrow" -> tomorrow's appointments
 *  - "auto"     -> what's left today until 5pm, tomorrow's after that (or when
 *                  today is already done), and today's leftovers as a last resort
 *
 * Returns null when there is nothing to show, so no notice appears at all.
 * Only pending and confirmed bookings count.
 */
export function pickHeadsUp(bookings, now = new Date(), mode = "auto") {
  const today = toISODate(now);
  const tomorrow = addDays(today, 1);
  const pad = (n) => String(n).padStart(2, "0");
  const nowStamp = `${today}T${pad(now.getHours())}:${pad(now.getMinutes())}:00`;

  const live = bookings
    .filter((b) => b.status === "pending" || b.status === "confirmed")
    .sort((a, b) => (a.start_time < b.start_time ? -1 : 1));

  const todayLeft = live.filter((b) => b.start_time.slice(0, 10) === today && b.end_time > nowStamp);
  const tomorrowAll = live.filter((b) => b.start_time.slice(0, 10) === tomorrow);

  const asToday = () => (todayLeft.length ? { label: "Today", date: today, items: todayLeft } : null);
  const asTomorrow = () => (tomorrowAll.length ? { label: "Tomorrow", date: tomorrow, items: tomorrowAll } : null);

  if (mode === "today") return asToday();
  if (mode === "tomorrow") return asTomorrow();

  if (now.getHours() < EVENING_HOUR && todayLeft.length) return asToday();
  return asTomorrow() || asToday();
}
