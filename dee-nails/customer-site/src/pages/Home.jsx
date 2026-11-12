import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AppointmentBar from "../components/AppointmentBar";
import Icon from "../components/Icon";
import ServicePhoto from "../components/ServicePhoto";
import { useAppointment } from "../lib/AppointmentContext";
import { duration, money, todayHours } from "../lib/format";

function groupByCategory(services) {
  const groups = new Map();
  services.forEach((s) => {
    const key = s.category || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });
  return [...groups.entries()].map(([name, items]) => ({ name, items }));
}

export default function Home() {
  const { services, info, error, reload, selectedIds, toggle } = useAppointment();
  const [category, setCategory] = useState("All");

  const groups = useMemo(() => (services ? groupByCategory(services) : []), [services]);
  const visible = category === "All" ? groups : groups.filter((g) => g.name === category);
  const currency = info?.currency;
  const whatsapp = info?.whatsapp_number ? `https://wa.me/${info.whatsapp_number}` : null;

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <h1>Fresh nails, booked in a minute.</h1>
          <p>Pick your services, choose a time, confirm on WhatsApp.</p>
          {info && (
            <div className="strip">
              <span className="pill">{todayHours(info)}</span>
              {whatsapp && <a className="pill pill-link" href={whatsapp} target="_blank" rel="noopener noreferrer"><Icon name="whatsapp" size={16} /> Chat on WhatsApp</a>}
            </div>
          )}
        </div>
      </section>

      {groups.length > 1 && (
        <div className="tabs-bar">
          <div className="wrap">
            <div className="tabs" role="tablist" aria-label="Service categories">
              {[{ name: "All", count: services.length }, ...groups.map((g) => ({ name: g.name, count: g.items.length }))].map((t) => (
                <button
                  key={t.name}
                  role="tab"
                  aria-selected={category === t.name}
                  className="tab"
                  onClick={() => setCategory(t.name)}
                >
                  {t.name} <span className="tab-count">{t.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="wrap menu">
        {error && (
          <div className="notice" role="alert">
            <p>{error}</p>
            <button className="btn" onClick={reload}>Try again</button>
          </div>
        )}
        {!error && services === null && <p className="muted">Loading services…</p>}
        {services && services.length === 0 && <p className="muted">No services are listed yet. Please check back soon.</p>}

        {visible.map((group) => (
          <section key={group.name} className="category" aria-labelledby={`cat-${group.name}`}>
            <h2 id={`cat-${group.name}`}>{group.name}</h2>
            <ul className="services">
              {group.items.map((s) => {
                const on = selectedIds.includes(s.id);
                return (
                  <li key={s.id} className={`service${on ? " is-on" : ""}`}>
                    <div className="service-photo">
                      <Link to={`/service/${s.id}`} aria-label={`${s.name}, view details`} tabIndex={-1}><ServicePhoto service={s} /></Link>
                      {s.images?.length > 1 && <span className="photo-count"><Icon name="image" size={14} />{s.images.length}</span>}
                      <button
                        className={`add${on ? " on" : ""}`}
                        aria-pressed={on}
                        aria-label={`${on ? "Remove" : "Add"} ${s.name}`}
                        onClick={() => toggle(s.id)}
                      >
                        <Icon name={on ? "check" : "plus"} size={24} />
                      </button>
                    </div>
                    <h3><Link to={`/service/${s.id}`}>{s.name}</Link></h3>
                    <p className="price">{money(s.price, currency)}</p>
                    <p className="service-meta"><Icon name="clock" size={15} />{duration(s.duration_minutes)}</p>
                    {s.description && <p className="service-desc">{s.description}</p>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <AppointmentBar />
    </>
  );
}
