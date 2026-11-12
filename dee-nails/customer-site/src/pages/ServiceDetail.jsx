import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Icon from "../components/Icon";
import ServicePhoto from "../components/ServicePhoto";
import { useAppointment } from "../lib/AppointmentContext";
import { duration, money } from "../lib/format";

/** One service: swipeable photos with a thumbnail strip, details, and an add button. */
export default function ServiceDetail() {
  const { id } = useParams();
  const { services, info, selectedIds, toggle, error } = useAppointment();
  const [index, setIndex] = useState(0);
  const track = useRef(null);

  if (error) return <div className="wrap page narrow"><p className="error" role="alert">{error}</p></div>;
  if (services === null) return <div className="wrap page narrow"><p className="muted">Loading…</p></div>;

  const service = services.find((s) => String(s.id) === id);
  if (!service) {
    return (
      <div className="wrap page narrow">
        <h1 className="page-title">Service not found</h1>
        <p className="muted">It may have been removed.</p>
        <Link to="/" className="btn btn-primary">See all services</Link>
      </div>
    );
  }

  const count = Math.max(service.images?.length || 0, 1);
  const on = selectedIds.includes(service.id);

  function go(i) {
    setIndex(i);
    const el = track.current;
    if (el?.scrollTo) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  function onScroll(e) {
    const el = e.currentTarget;
    if (!el.clientWidth) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  }

  return (
    <div className="wrap page narrow has-dock">
      <Link to="/" className="back"><Icon name="back" size={20} /> Services</Link>

      <div className="gallery">
        <div className="track" ref={track} onScroll={onScroll} aria-label={`${service.name} photos`}>
          {Array.from({ length: count }, (_, i) => (
            <div className="slide" key={i}><ServicePhoto service={service} index={i} /></div>
          ))}
        </div>
        {count > 1 && (
          <div className="thumbs" role="group" aria-label="Choose photo">
            {Array.from({ length: count }, (_, i) => (
              <button key={i} className="thumb-btn" aria-pressed={index === i} aria-label={`Photo ${i + 1} of ${count}`} onClick={() => go(i)}>
                <ServicePhoto service={service} index={i} />
              </button>
            ))}
          </div>
        )}
      </div>

      {service.category && <p className="muted small crumb">{service.category}</p>}
      <h1 className="detail-title">{service.name}</h1>
      <p className="detail-price">{money(service.price, info?.currency)}</p>
      <p className="service-meta"><Icon name="clock" size={16} />{duration(service.duration_minutes)}</p>
      {service.description && <p className="detail-desc">{service.description}</p>}

      <div className="dock" role="region" aria-label="Add to appointment">
        <div className="wrap dock-inner">
          <button className={`btn ${on ? "btn-added" : "btn-primary"} grow`} aria-pressed={on} onClick={() => toggle(service.id)}>
            <Icon name={on ? "check" : "plus"} size={20} />
            {on ? "Added" : "Add to appointment"}
          </button>
          {selectedIds.length > 0 && <Link to="/book" className="btn">Choose a time</Link>}
        </div>
      </div>
    </div>
  );
}
