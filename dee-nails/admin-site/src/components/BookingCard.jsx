import { useState } from "react";
import { api } from "../lib/api";
import { clock, duration, money, splitDateTime } from "../lib/format";

const STATUS_LABEL = {
  pending: "Waiting for you",
  confirmed: "Confirmed",
  completed: "Done",
  cancelled: "Cancelled",
  no_show: "No-show",
};

/**
 * One booking. Confirm, cancel and reschedule all come back with a WhatsApp
 * link to the client -- `onDone` hands that to the page so Dee can message
 * them in one tap.
 */
export default function BookingCard({ booking, currency, onDone }) {
  const start = splitDateTime(booking.start_time);
  const end = splitDateTime(booking.end_time);
  const [mode, setMode] = useState(null); // null | "cancel" | "reschedule"
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState(start.date);
  const [newTime, setNewTime] = useState(start.time);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action, label, successMode = null) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      setMode(successMode);
      onDone(result, label);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const status = booking.status;
  const live = status === "pending" || status === "confirmed";

  return (
    <article className={`booking status-${status}`}>
      <div className="booking-time">
        <strong>{clock(start.time)}</strong>
        <span className="muted">to {clock(end.time)}</span>
      </div>

      <div className="booking-body">
        <div className="booking-head">
          <h3>{booking.customer_name}</h3>
          <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
        </div>
        <p className="muted">
          <a href={`tel:+${booking.customer_phone}`}>+{booking.customer_phone}</a>
          {" "}Ref {booking.reference}
        </p>
        <ul className="booking-items">
          {booking.items.map((i) => (
            <li key={i.service_id}>{i.service_name} <span className="muted">{duration(i.duration_minutes)}</span></li>
          ))}
        </ul>
        <p className="booking-total">
          <strong>{money(booking.total_price, currency)}</strong>
          <span className="muted"> {duration(booking.total_duration_minutes)}</span>
        </p>
        {booking.notes && <p className="booking-notes">“{booking.notes}”</p>}
        {status === "cancelled" && booking.cancel_reason && (
          <p className="muted">Reason: {booking.cancel_reason}</p>
        )}

        {live && mode === null && (
          <div className="actions">
            {status === "pending" && (
              <button className="btn btn-primary btn-sm" disabled={busy}
                onClick={() => run(() => api.setBookingStatus(booking.id, "confirmed"), "Confirmed")}>
                Confirm
              </button>
            )}
            {status === "confirmed" && (
              <>
                <button className="btn btn-sm" disabled={busy}
                  onClick={() => run(() => api.setBookingStatus(booking.id, "completed"), "Marked done")}>
                  Mark done
                </button>
                <button className="btn btn-sm" disabled={busy}
                  onClick={() => run(() => api.setBookingStatus(booking.id, "no_show"), "Marked no-show")}>
                  No-show
                </button>
              </>
            )}
            <button className="btn btn-sm" onClick={() => setMode("reschedule")}>Reschedule</button>
            <button className="btn btn-danger btn-sm" onClick={() => setMode("cancel")}>Cancel booking</button>
          </div>
        )}

        {mode === "cancel" && (
          <div className="panel">
            <label className="form-row">
              <span>Reason (sent to the client)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Optional" />
            </label>
            <div className="actions">
              <button className="btn btn-danger btn-sm" disabled={busy}
                onClick={() => run(() => api.setBookingStatus(booking.id, "cancelled", reason.trim()), "Cancelled")}>
                Cancel this booking
              </button>
              <button className="btn btn-sm" onClick={() => setMode(null)}>Back</button>
            </div>
          </div>
        )}

        {mode === "reschedule" && (
          <div className="panel">
            <div className="form-inline">
              <label className="form-row">
                <span>New date</span>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </label>
              <label className="form-row">
                <span>New start time</span>
                <input type="time" step="900" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
              </label>
            </div>
            <div className="actions">
              <button className="btn btn-primary btn-sm" disabled={busy || !newDate || !newTime}
                onClick={() => run(() => api.rescheduleBooking(booking.id, `${newDate}T${newTime}:00`), "Moved")}>
                Move booking
              </button>
              <button className="btn btn-sm" onClick={() => setMode(null)}>Back</button>
            </div>
          </div>
        )}

        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </article>
  );
}
