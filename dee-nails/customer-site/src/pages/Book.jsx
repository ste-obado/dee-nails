import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAppointment } from "../lib/AppointmentContext";
import { forgetClient, loadClient, saveClient } from "../lib/client";
import { backendWeekday, clock, duration, longDate, money, parseISODate, toISODate } from "../lib/format";

const DAYS_SHOWN = 14;

function upcomingDays(info) {
  const today = new Date();
  return Array.from({ length: DAYS_SHOWN }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const hours = info.working_hours.find((h) => h.weekday === backendWeekday(d));
    return { iso: toISODate(d), date: d, open: Boolean(hours?.is_open) };
  });
}

// every start time Dee could offer that day (free or not), so booked ones can be shown as busy
function candidateTimes(info, iso, totalMinutes) {
  const hours = info.working_hours.find((h) => h.weekday === backendWeekday(parseISODate(iso)));
  if (!hours || !hours.is_open) return [];
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out = [];
  for (let m = toMin(hours.open_time); m + totalMinutes <= toMin(hours.close_time); m += info.slot_interval_minutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

export default function Book() {
  const navigate = useNavigate();
  const { selected, selectedIds, remove, clear, info, totalMinutes, totalPrice } = useAppointment();

  const days = useMemo(() => (info ? upcomingDays(info) : []), [info]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [free, setFree] = useState(null);           // null = loading
  const [slotError, setSlotError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const saved = useMemo(loadClient, []);
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [notes, setNotes] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // start on the first day Dee is open
  useEffect(() => {
    if (!date && days.length) setDate(days.find((d) => d.open)?.iso || days[0].iso);
  }, [days, date]);

  const idsKey = selectedIds.join(",");

  useEffect(() => {
    if (!date || selectedIds.length === 0) return;
    let stale = false;
    setFree(null);
    setSlotError("");
    api.getSlots(date, selectedIds)
      .then((res) => {
        if (stale) return;
        setFree(res.slots);
        setTime((t) => (res.slots.includes(t) ? t : ""));
      })
      .catch((err) => {
        if (stale) return;
        setSlotError(err.message);
        setFree([]);
      });
    return () => { stale = true; };
  }, [date, idsKey, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const times = useMemo(
    () => (info && date ? candidateTimes(info, date, totalMinutes) : []),
    [info, date, totalMinutes]
  );
  const dayIsClosed = info && date && times.length === 0 && days.find((d) => d.iso === date)?.open === false;
  const freeSet = useMemo(() => new Set(free || []), [free]);

  async function submit(e) {
    e.preventDefault();
    setFormError("");
    if (!time) return setFormError("Choose a time for your appointment.");
    if (!name.trim()) return setFormError("Enter your name.");
    if (!phone.trim()) return setFormError("Enter your phone number so Dee can reach you.");

    setSubmitting(true);
    try {
      const result = await api.createBooking({
        name: name.trim(),
        phone: phone.trim(),
        notes: notes.trim(),
        serviceIds: selectedIds,
        startTime: `${date}T${time}:00`,
      });
      try {
        sessionStorage.setItem("dee_last_booking", JSON.stringify(result));
      } catch { /* refresh on the next page just won't restore it */ }
      if (remember) saveClient({ name: name.trim(), phone: phone.trim() });
      else forgetClient();
      clear();
      navigate("/booked", { state: result });
    } catch (err) {
      setFormError(err.message);
      // most likely someone took the slot first: reload what's free
      setTime("");
      setRefreshKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  }

  if (!info) return <div className="wrap page"><p className="muted">Loading…</p></div>;

  if (selected.length === 0) {
    return (
      <div className="wrap page narrow">
        <h1 className="page-title">My appointment</h1>
        <p className="muted">You haven't picked any services yet.</p>
        <Link to="/" className="btn btn-primary">See the services</Link>
      </div>
    );
  }

  return (
    <form id="book-form" className="wrap page narrow has-dock" onSubmit={submit} noValidate>
      <h1 className="page-title">My appointment</h1>

      <section aria-labelledby="h-services">
        <h2 id="h-services">Services</h2>
        <ul className="picked">
          {selected.map((s) => (
            <li key={s.id}>
              <div>
                <strong>{s.name}</strong>
                <span className="muted"> {duration(s.duration_minutes)}</span>
              </div>
              <span className="price">{money(s.price, info.currency)}</span>
              <button type="button" className="link" onClick={() => remove(s.id)} aria-label={`Remove ${s.name}`}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="total">
          <span>Total, {duration(totalMinutes)}</span>
          <strong>{money(totalPrice, info.currency)}</strong>
        </div>
        <Link to="/" className="link">Add more services</Link>
      </section>

      <section aria-labelledby="h-day">
        <h2 id="h-day">Choose a day</h2>
        <div className="days" role="group" aria-label="Day">
          {days.map((d) => (
            <button
              type="button"
              key={d.iso}
              className="day"
              aria-pressed={date === d.iso}
              disabled={!d.open}
              onClick={() => { setDate(d.iso); setTime(""); }}
            >
              <span>{d.date.toLocaleDateString("en-GB", { weekday: "short" })}</span>
              <strong>{d.date.getDate()}</strong>
              <span>{d.open ? d.date.toLocaleDateString("en-GB", { month: "short" }) : "Closed"}</span>
            </button>
          ))}
        </div>
        <label className="later">
          Need a later date?
          <input
            type="date"
            value={date}
            min={toISODate(new Date())}
            max={toISODate(new Date(Date.now() + info.max_days_ahead * 86400000))}
            onChange={(e) => { if (e.target.value) { setDate(e.target.value); setTime(""); } }}
          />
        </label>
      </section>

      <section aria-labelledby="h-time">
        <h2 id="h-time">Choose a time</h2>
        {date && <p className="muted">{longDate(date)}. Hatched times are already taken.</p>}
        {slotError && <p className="error" role="alert">{slotError}</p>}
        {dayIsClosed && <p className="muted">Dee is closed on this day. Pick another day.</p>}
        {free === null && !slotError && <p className="muted">Checking Dee's calendar…</p>}
        {free !== null && !dayIsClosed && times.length > 0 && free.length === 0 && !slotError && (
          <p className="muted">Nothing free that day for {duration(totalMinutes)}. Try another day.</p>
        )}
        {free !== null && times.length > 0 && (
          <div className="slots" role="group" aria-label="Time">
            {times.map((t) => {
              const open = freeSet.has(t);
              return (
                <button
                  type="button"
                  key={t}
                  className={`slot${open ? "" : " busy"}`}
                  aria-pressed={time === t}
                  aria-disabled={!open}
                  disabled={!open}
                  aria-label={open ? clock(t) : `${clock(t)}, unavailable`}
                  onClick={() => setTime(t)}
                >
                  {clock(t)}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="h-you">
        <h2 id="h-you">Your details</h2>
        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
        </label>
        <label className="field">
          Phone number
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            maxLength={20}
          />
        </label>
        <label className="field">
          Notes for Dee (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={500} placeholder="Shape, colour, a photo you'll send on WhatsApp…" />
        </label>
      </section>

      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember my name and number on this phone
      </label>

      {formError && <p className="error" role="alert">{formError}</p>}
      <p className="muted small">
        Your time is held straight away. Next you'll send the details to Dee on WhatsApp so she can confirm.
      </p>

      <div className="dock" role="region" aria-label="Total">
        <div className="wrap dock-inner">
          <div className="dock-info">
            <span className="muted">Total {duration(totalMinutes)}</span>
            <strong>{money(totalPrice, info.currency)}</strong>
          </div>
          <button className="btn btn-primary" disabled={submitting}>
            {submitting ? "Booking…" : "Book appointment"}
          </button>
        </div>
      </div>
    </form>
  );
}
