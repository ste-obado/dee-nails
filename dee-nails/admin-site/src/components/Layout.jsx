import { NavLink, useNavigate } from "react-router-dom";
import { api, clearToken } from "../lib/api";

const LINKS = [
  { to: "/", label: "Schedule", end: true },
  { to: "/services", label: "Services" },
  { to: "/availability", label: "Hours and time off" },
  { to: "/settings", label: "Settings" },
];

export default function Layout({ children }) {
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await api.logout();
    } catch {
      // even if the server call fails, still clear the local token
    }
    clearToken();
    navigate("/login");
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">Dee Nails<span>admin</span></div>
        <nav>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? "active" : "")}>
              {l.label}
            </NavLink>
          ))}
          <button className="logout" onClick={handleLogout}>Log out</button>
        </nav>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
