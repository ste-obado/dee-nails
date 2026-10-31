import { useCallback, useEffect, useMemo, useState } from "react";
import BookingCard from "../components/BookingCard";
import HeadsUp from "../components/HeadsUp";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { addDays, clock, longDate, mondayOf, money, shortDate, splitDateTime, toISODate } from "../lib/format";

const CURRENCY = "KES";

// ISO strings ("2026-11-02T13:00:00") sort correctly as plain text
const dayStart = (iso) => `${iso}T00:00:00`;
const overlapsDay = (block, iso) => block.start_time < dayStart(addDays(iso, 1)) && block.end_time > dayStart(iso);

export default function Schedule() {
  const [view, setView] = useState("day"); // "day" | "week"
  const [date, setDate] = useState(toISODate(new Date()));
  const [showCancelled, setShowCancelled] = useState(false);
  const [bookings, setBookings] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const from = view === "week" ? mondayOf(date) : date;
  const to = view === "week" ? addDays(from, 6) : date;

  useEffect(() => {
    let stale = false;
    setError("");
    Promise.all([api.getBookings({ from_date: from, to_date: to }), api.getBlockedTimes()])
      .then(([b, k]) => {
        if (stale) return;
        setBookings(b);
        setBlocks(k);
      })
      .catch((err) => !stale && setError(err.message));
    return () => { stale = true; };
  }, [from, to, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  function handleDone(result, label) {
    if (result.whatsapp_url) {
      setNotice({ label, name: result.booking.customer_name, url: result.whatsapp_url });
    }
    refresh();
  }

  const days = useMemo(() => {
    const count = view === "week" ? 7 : 1;
    return Array.from({ length: count }, (_, i) => addDays(from, i));
  }, [from, view]);

  const visible = (bookings || []).filter(
    (b) => showCancelled || (b.status !== "cancelled" && b.status !== "no_show")
  );
  const active = (bookings || []).filter((b) => b.status === "pending" || b.status === "confirmed");
  const pendingCount = active.filter((b) => b.status === "pending").length;
  const expected = active.reduce((sum, b) => sum + b.total_price, 0);

  const step = view === "week" ? 7 : 1;

  return (
    <Layout>
      <HeadsUp onOpenDay={(iso) => { setDate(iso); setView("day"); }} />

      <div className="page-head">
        <h1>Schedule</h1>
        <div className="seg" role="group" aria-label="View">
          <button aria-pressed={view === "day"} onClick={() => setView("day")}>Day</button>
          <button aria-pressed={view === "week"} onClick={() => setView("week")}>Week</button>
        </div>
      </div>

      <div className="date-nav">
        <button className="btn btn-sm" onClick={() => setDate(addDays(date, -step))} aria-label={`Previous ${view}`}>Previous</button>
        <button className="btn btn-sm" onClick={() => setDate(toISODate(new Date()))}>Today</button>
        <button className="btn btn-sm" onClick={() => setDate(addDays(date, step))} aria-label={`Next ${view}`}>Next</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Go to date" />
      </div>

      <p className="range-title">
        {view === "day" ? longDate(from) : `${shortDate(from)} to ${shortDate(to)}`}
      </p>

      {notice && (
        <div className="notice-bar" role="status">
          <span>{notice.label}: {notice.name}. Let them know:</span>
          <a className="btn btn-whatsapp btn-sm" href={notice.url} target="_blank" rel="noopener noreferrer">
            Message on WhatsApp
          </a>
          <button className="btn btn-sm" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}
      {bookings === null && !error && <p className="muted">Loading…</p>}

      {bookings !== null && (
        <>
          <p className="summary">
            <strong>{active.length} {active.length === 1 ? "booking" : "bookings"}</strong>
            {pendingCount > 0 && <span> ({pendingCount} to confirm)</span>}
            <span className="muted"> {money(expected, CURRENCY)} expected</span>
          </p>
          <label className="check">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Show cancelled and no-shows
          </label>

          {days.map((iso) => {
            const dayBookings = visible.filter((b) => splitDateTime(b.start_time).date === iso);
            const dayBlocks = blocks.filter((k) => overlapsDay(k, iso));
            const items = [
              ...dayBookings.map((b) => ({ kind: "booking", key: `b${b.id}`, start: b.start_time, b })),
              ...dayBlocks.map((k) => ({ kind: "block", key: `k${k.id}-${iso}`, start: k.start_time < dayStart(iso) ? dayStart(iso) : k.start_time, k })),
            ].sort((a, b) => (a.start < b.start ? -1 : 1));

            return (
              <section key={iso} className="day-group">
                {view === "week" && (
                  <h2>
                    {shortDate(iso)}
                    <button className="link" onClick={() => { setDate(iso); setView("day"); }}>Open day</button>
                  </h2>
                )}
                {items.length === 0 && <p className="muted">Nothing booked.</p>}
                {items.map((item) =>
                  item.kind === "booking" ? (
                    <BookingCard key={item.key} booking={item.b} currency={CURRENCY} onDone={handleDone} />
                  ) : (
                    <div key={item.key} className="timeoff">
                      <strong>Time off</strong>
                      <span>{clock(splitDateTime(item.k.start_time).time)} to {clock(splitDateTime(item.k.end_time).time)}</span>
                      {item.k.reason && <span className="muted">{item.k.reason}</span>}
                    </div>
                  )
                )}
              </section>
            );
          })}
        </>
      )}
    </Layout>
  );
}
