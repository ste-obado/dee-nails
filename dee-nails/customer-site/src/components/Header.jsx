import { Link, useLocation } from "react-router-dom";
import { useAppointment } from "../lib/AppointmentContext";

export default function Header() {
  const { info, selected } = useAppointment();
  const { pathname } = useLocation();
  const name = info?.salon_name || "Dee Nails";

  return (
    <header className="site">
      <div className="wrap bar">
        <Link to="/" className="brand" aria-label={name}>
          <img src="/logo-wordmark-white.png" alt={name} width="141" height="28" />
        </Link>
        <nav aria-label="Main">
          {pathname !== "/check" && <Link to="/check">Check booking</Link>}
          {pathname !== "/book" && (
            <Link to="/book" className="appt-link">
              My appointment
              {selected.length > 0 && <span className="count" aria-label={`${selected.length} selected`}>{selected.length}</span>}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
