import { Link } from "react-router-dom";
import { useAppointment } from "../lib/AppointmentContext";
import { duration, money } from "../lib/format";

/** Pinned summary at the bottom of the menu once something is picked. */
export default function AppointmentBar() {
  const { selected, totalMinutes, totalPrice, info } = useAppointment();
  if (selected.length === 0) return null;

  return (
    <div className="dock" role="region" aria-label="My appointment">
      <div className="wrap dock-inner">
        <div className="dock-info">
          <span><strong>{selected.length} {selected.length === 1 ? "service" : "services"}</strong> <span className="muted">{duration(totalMinutes)}</span></span>
          <strong>{money(totalPrice, info?.currency)}</strong>
        </div>
        <Link to="/book" className="btn btn-primary">Choose a time</Link>
      </div>
    </div>
  );
}
