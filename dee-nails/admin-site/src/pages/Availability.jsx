import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { WEEKDAYS, clock, shortDate, splitDateTime, toISODate } from "../lib/format";

export default function Availability() {
  const [hours, setHours] = useState(null);
  const [hoursMsg, setHoursMsg] = useState("");
  const [hoursError, setHoursError] = useState("");

  const [blocks, setBlocks] = useState([]);
  const [blockError, setBlockError] = useState("");
  const [affected, setAffected] = useState([]);
  const today = toISODate(new Date());
  const [form, setForm] = useState({ date: today, endDate: "", start: "13:00", end: "14:00", allDay: false, reason: "" });

  const loadBlocks = () => api.getBlockedTimes().then(setBlocks).catch((err) => setBlockError(err.message));

  useEffect(() => {
    api.getWorkingHours()
      .then((rows) => setHours(rows.map((r) => ({ ...r, open_time: r.open_time.slice(0, 5), close_time: r.close_time.slice(0, 5) }))))
      .catch((err) => setHoursError(err.message));
    loadBlocks();
  }, []);

  const setDay = (weekday, patch) =>
    setHours((rows) => rows.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));

  async function saveHours() {
    setHoursError("");
    setHoursMsg("");
    const bad = hours.find((h) => h.is_open && h.close_time <= h.open_time);
    if (bad) return setHoursError(`${WEEKDAYS[bad.weekday]}: closing time must be after opening time.`);
    try {
      await api.updateWorkingHours(hours.map((h) => ({ ...h, open_time: `${h.open_time}:00`, close_time: `${h.close_time}:00` })));
      setHoursMsg("Opening hours saved.");
    } catch (err) {
      setHoursError(err.message);
    }
  }

  async function addBlock(e) {
    e.preventDefault();
    setBlockError("");
    setAffected([]);
    const lastDate = form.endDate || form.date;
    const start = form.allDay ? "00:00" : form.start;
    const end = form.allDay ? "23:59" : form.end;
    const startTime = `${form.date}T${start}:00`;
    const endTime = `${lastDate}T${end}:00`;
    if (endTime <= startTime) return setBlockError("The end must be after the start.");
    try {
      const result = await api.addBlockedTime({ start_time: startTime, end_time: endTime, reason: form.reason.trim() || null });
      setAffected(result.affected_bookings);
      setForm((f) => ({ ...f, reason: "", endDate: "" }));
      await loadBlocks();
    } catch (err) {
      setBlockError(err.message);
    }
  }

  async function removeBlock(id) {
    setBlockError("");
    try {
      await api.deleteBlockedTime(id);
      setAffected([]);
      await loadBlocks();
    } catch (err) {
      setBlockError(err.message);
    }
  }

  return (
    <Layout>
      <h1>Hours and time off</h1>

      <section className="card">
        <h2>Opening hours</h2>
        {hours === null && !hoursError && <p className="muted">Loading…</p>}
        {hours && (
          <div className="hours">
            {hours.map((h) => (
              <div key={h.weekday} className="hours-row">
                <label className="check">
                  <input type="checkbox" checked={h.is_open} onChange={(e) => setDay(h.weekday, { is_open: e.target.checked })} />
                  {WEEKDAYS[h.weekday]}
                </label>
                {h.is_open ? (
                  <span className="hours-times">
                    <input type="time" step="900" value={h.open_time} onChange={(e) => setDay(h.weekday, { open_time: e.target.value })} aria-label={`${WEEKDAYS[h.weekday]} opens`} />
                    to
                    <input type="time" step="900" value={h.close_time} onChange={(e) => setDay(h.weekday, { close_time: e.target.value })} aria-label={`${WEEKDAYS[h.weekday]} closes`} />
                  </span>
                ) : (
                  <span className="muted">Closed</span>
                )}
              </div>
            ))}
          </div>
        )}
        {hoursError && <p className="error-text" role="alert">{hoursError}</p>}
        {hoursMsg && <p className="ok-text" role="status">{hoursMsg}</p>}
        <div className="actions"><button className="btn btn-primary" onClick={saveHours} disabled={!hours}>Save hours</button></div>
      </section>

      <section className="card">
        <h2>Time off</h2>
        <p className="muted">Block lunch, a day off or a holiday. Clients can't book these times.</p>
        <form onSubmit={addBlock}>
          <div className="form-inline">
            <label className="form-row"><span>{form.endDate || form.allDay ? "From date" : "Date"}</span>
              <input type="date" value={form.date} min={today} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="form-row"><span>Until date (optional)</span>
              <input type="date" value={form.endDate} min={form.date} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </label>
            {!form.allDay && (
              <>
                <label className="form-row"><span>From</span>
                  <input type="time" step="900" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                </label>
                <label className="form-row"><span>To</span>
                  <input type="time" step="900" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                </label>
              </>
            )}
          </div>
          <label className="check">
            <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
            All day
          </label>
          <label className="form-row"><span>Reason (only you see this)</span>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={200} placeholder="Lunch, sick day…" />
          </label>
          {blockError && <p className="error-text" role="alert">{blockError}</p>}
          <div className="actions"><button className="btn btn-primary">Block this time</button></div>
        </form>

        {affected.length > 0 && (
          <div className="warn" role="alert">
            <strong>{affected.length === 1 ? "1 booking is" : `${affected.length} bookings are`} inside this time off:</strong>
            <ul>
              {affected.map((b) => (
                <li key={b.id}>
                  {b.customer_name}, {shortDate(splitDateTime(b.start_time).date)} at {clock(splitDateTime(b.start_time).time)}
                </li>
              ))}
            </ul>
            <p>They're still booked. Open the <Link to="/">Schedule</Link> to move or cancel them.</p>
          </div>
        )}

        {blocks.length === 0 ? (
          <p className="muted">No time off coming up.</p>
        ) : (
          <ul className="blocks">
            {blocks.map((k) => {
              const s = splitDateTime(k.start_time);
              const e = splitDateTime(k.end_time);
              return (
                <li key={k.id}>
                  <div>
                    <strong>{shortDate(s.date)}{e.date !== s.date && ` to ${shortDate(e.date)}`}</strong>
                    <span className="muted"> {clock(s.time)} to {clock(e.time)}{k.reason ? `, ${k.reason}` : ""}</span>
                  </div>
                  <button className="btn btn-sm" onClick={() => removeBlock(k.id)}>Remove</button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Layout>
  );
}
