import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { addDays, clock, splitDateTime, toISODate } from "../lib/format";
import { headsUpKey, loadDismissed, loadPrefs, pickHeadsUp, saveDismissed } from "../lib/headsUp";

/**
 * "Here are tomorrow's appointments" -- shown at the top of the Schedule only
 * when there's something to show. Turned on/off (and set to today / tomorrow /
 * auto) in Settings.
 */
export default function HeadsUp({ onOpenDay }) {
  const [prefs] = useState(loadPrefs);
  const [pick, setPick] = useState(null);
  const [dismissed, setDismissed] = useState(loadDismissed);

  useEffect(() => {
    if (!prefs.enabled) return;
    const now = new Date();
    const today = toISODate(now);
    let stale = false;
    api.getBookings({ from_date: today, to_date: addDays(today, 1) })
      .then((bookings) => !stale && setPick(pickHeadsUp(bookings, now, prefs.mode)))
      .catch(() => {}); // a missing heads-up shouldn't get in the way of the schedule
    return () => { stale = true; };
  }, [prefs]);

  if (!prefs.enabled || !pick || dismissed === headsUpKey(pick)) return null;

  const count = pick.items.length;
  const toConfirm = pick.items.filter((b) => b.status === "pending").length;

  return (
    <section className="headsup" role="region" aria-label="Heads-up">
      <h2>
        {pick.label}: {count} {count === 1 ? "appointment" : "appointments"}
        {toConfirm > 0 && <span className="badge badge-pending">{toConfirm} to confirm</span>}
      </h2>
      <ul>
        {pick.items.map((b) => (
          <li key={b.id}>
            <strong>{clock(splitDateTime(b.start_time).time)}</strong>
            <span>{b.customer_name}</span>
            <span className="muted">{b.items.map((i) => i.service_name).join(", ")}</span>
          </li>
        ))}
      </ul>
      <div className="actions">
        <button className="btn btn-sm" onClick={() => onOpenDay(pick.date)}>Open {pick.label.toLowerCase()}</button>
        <button
          className="btn btn-sm"
          onClick={() => {
            saveDismissed(headsUpKey(pick));
            setDismissed(headsUpKey(pick));
          }}
        >
          Dismiss
        </button>
      </div>
    </section>
  );
}
