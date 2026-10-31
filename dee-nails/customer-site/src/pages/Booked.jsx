import { Link, Navigate, useLocation } from "react-router-dom";
import { useAppointment } from "../lib/AppointmentContext";
import { clock, duration, longDate, money, splitDateTime } from "../lib/format";

function loadSaved() {
  try {
    return JSON.parse(sessionStorage.getItem("dee_last_booking") || "null");
  } catch {
    return null;
  }
}

export default function Booked() {
  const location = useLocation();
  const { info } = useAppointment();
  const result = location.state || loadSaved();

  if (!result?.booking) return <Navigate to="/" replace />;

  const { booking, whatsapp_url: whatsappUrl } = result;
  const start = splitDateTime(booking.start_time);
  const end = splitDateTime(booking.end_time);
  const currency = info?.currency;

  return (
    <div className="wrap page narrow">
      <h1 className="page-title">Your time is held</h1>
      <p className="lead">
        One more step: send these details to Dee on WhatsApp. She'll confirm your appointment there.
      </p>

      {whatsappUrl ? (
        <a className="btn btn-whatsapp btn-block" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          Send details on WhatsApp
        </a>
      ) : (
        <p className="notice">
          Dee has your booking and will contact you on {booking.customer_phone}.
        </p>
      )}

      <section className="receipt" aria-label="Booking details">
        <dl>
          <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
          <div><dt>Date</dt><dd>{longDate(start.date)}</dd></div>
          <div><dt>Time</dt><dd>{clock(start.time)} to {clock(end.time)}</dd></div>
          <div><dt>Name</dt><dd>{booking.customer_name}</dd></div>
        </dl>
        <ul className="picked">
          {booking.items.map((item) => (
            <li key={item.service_id}>
              <div>
                <strong>{item.service_name}</strong>
                <span className="muted"> {duration(item.duration_minutes)}</span>
              </div>
              <span className="price">{money(item.price, currency)}</span>
            </li>
          ))}
        </ul>
        <div className="total">
          <span>Total, {duration(booking.total_duration_minutes)}</span>
          <strong>{money(booking.total_price, currency)}</strong>
        </div>
        <p className="muted small">Status: waiting for Dee to confirm.</p>
      </section>

      <p><Link to="/check" className="link">Check this booking later</Link></p>
      <Link to="/" className="link">Book another appointment</Link>
    </div>
  );
}
