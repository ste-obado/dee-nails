// "Remember me": the client's name and phone, kept in this browser only so a
// repeat booking is two taps. Never sent anywhere except with a booking.
const KEY = "dee_client";

export function loadClient() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { name: String(v.name || ""), phone: String(v.phone || "") };
  } catch {
    return { name: "", phone: "" };
  }
}

export function saveClient({ name, phone }) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name, phone }));
  } catch { /* private mode: just won't be remembered */ }
}

export function forgetClient() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}
