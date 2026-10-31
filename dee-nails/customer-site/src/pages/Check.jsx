import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAppointment } from "../lib/AppointmentContext";
import { loadClient } from "../lib/client";
import { clock, duration, longDate, money, splitDateTime } from "../lib/format";

const STATUS_TEXT = {
  pending: "Waiting for Dee to confirm",
  confirmed: "Confirmed. See you then!",
  completed: "Completed",
  cancelled: "Cancelled. Message Dee on WhatsApp to rebook",
  no_show: "Marked as missed",
};

function lastReference() {
  try {
    return JSON.parse(sessionStorage.getItem("dee_last_booking") || "null")?.booking?.reference || "";
  } catch {
    return "";
  }
}

export default function Check() {
  const { info } = useAppointment();
  const [reference, setReference] = useState(lastReference);
  const [phone, setPhone] = useState(() => loadClient().phone);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBooking(null);
    if (!reference.trim() || !phone.trim()) return setError("Enter your booking reference and phone number.");
    setLoading(true);
    try {
      setBooking(await api.lookupBooking({ reference: reference.trim(), phone: phone.trim() }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const start = booking && splitDateTime(booking.start_time);
  const end = booking && splitDateTime(booking.end_time);
  const whatsapp = info?.whatsapp_number ? `https://wa.me/${info.whatsapp_number}` : null;

  return (
    <div className="wrap page narrow">
      <h1 className="page-title">Check my booking</h1>
      <p className="lead">Enter the reference from your confirmation and the phone number you booked with.</p>

      <form onSubmit={submit} noValidate>
        <label className="field">
          Booking reference
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="DN-7K2QX9" autoCapitalize="characters" maxLength={12} />
        </label>
        <label className="field">
          Phone number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="0712 345 678" maxLength={20} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={loading}>{loading ? "Checking…" : "Check booking"}</button>
      </form>

      {booking && (
        <section className="receipt" aria-label="Booking status">
          <p className={`status status-${booking.status}`}>{STATUS_TEXT[booking.status]}</p>
          <dl>
            <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
            <div><dt>Date</dt><dd>{longDate(start.date)}</dd></div>
            <div><dt>Time</dt><dd>{clock(start.time)} to {clock(end.time)}</dd></div>
            <div><dt>Name</dt><dd>{booking.customer_name}</dd></div>
          </dl>
          <ul className="picked">
            {booking.items.map((item) => (
              <li key={item.service_id}>
                <div><strong>{item.service_name}</strong> <span className="muted">{duration(item.duration_minutes)}</span></div>
                <span className="price">{money(item.price, info?.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="total">
            <span>Total, {duration(booking.total_duration_minutes)}</span>
            <strong>{money(booking.total_price, info?.currency)}</strong>
          </div>
          {whatsapp && <a className="btn btn-whatsapp btn-block" href={whatsapp} target="_blank" rel="noopener noreferrer">Message Dee on WhatsApp</a>}
        </section>
      )}

      <p><Link to="/" className="link">Back to services</Link></p>
    </div>
  );
}
