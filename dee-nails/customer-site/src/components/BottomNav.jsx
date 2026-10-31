import { NavLink } from "react-router-dom";
import { useAppointment } from "../lib/AppointmentContext";
import Icon from "./Icon";

/** Phone-style bottom navigation. Hidden on wider screens, where the header links are used. */
export default function BottomNav() {
  const { selected } = useAppointment();
  const item = ({ isActive }) => `nav-item${isActive ? " active" : ""}`;

  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end className={item}><Icon name="grid" /><span>Services</span></NavLink>
      <NavLink to="/check" className={item}><Icon name="search" /><span>Check booking</span></NavLink>
      <NavLink to="/book" className={item}>
        <span className="nav-icon">
          <Icon name="calendar" />
          {selected.length > 0 && <span className="count" aria-label={`${selected.length} selected`}>{selected.length}</span>}
        </span>
        <span>My appointment</span>
      </NavLink>
    </nav>
  );
}
