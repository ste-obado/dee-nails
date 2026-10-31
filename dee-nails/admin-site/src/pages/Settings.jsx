import { useEffect, useState } from "react";
import Layout from "../components/Layout";
import { api } from "../lib/api";
import { loadPrefs, savePrefs } from "../lib/headsUp";

// "+254 702 839 214" or "0702 839214" -> "254702839214" (what wa.me links need)
export function cleanWhatsapp(raw) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `254${digits.slice(1)}`;
  return digits;
}

const num = (v) => Number(v);

export default function Settings() {
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [headsUp, setHeadsUp] = useState(loadPrefs);

  function changeHeadsUp(patch) {
    const next = { ...headsUp, ...patch };
    setHeadsUp(next);
    savePrefs(next);
  }

  useEffect(() => {
    api.getSettings()
      .then((s) => setForm({ ...s, whatsapp_number: s.whatsapp_number || "" }))
      .catch((err) => setError(err.message));
  }, []);

  const set = (field) => (e) => {
    setSaved(false);
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  async function save(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    const whatsapp = cleanWhatsapp(form.whatsapp_number);
    if (whatsapp && !/^\d{10,15}$/.test(whatsapp)) {
      return setError("Enter the WhatsApp number with country code, for example 254702839214.");
    }
    setSaving(true);
    try {
      const updated = await api.updateSettings({
        whatsapp_number: whatsapp,
        buffer_minutes: num(form.buffer_minutes),
        min_notice_minutes: num(form.min_notice_minutes),
        slot_interval_minutes: num(form.slot_interval_minutes),
        max_days_ahead: num(form.max_days_ahead),
      });
      setForm({ ...updated, whatsapp_number: updated.whatsapp_number || "" });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout>
      <h1>Settings</h1>

      <section className="card">
        <h2>Heads-up on the Schedule</h2>
        <p className="muted">
          A reminder at the top of the Schedule listing your upcoming appointments. It only appears when there
          is something to show. Saved on this device only.
        </p>
        <label className="check">
          <input type="checkbox" checked={headsUp.enabled} onChange={(e) => changeHeadsUp({ enabled: e.target.checked })} />
          Show the heads-up
        </label>
        {headsUp.enabled && (
          <label className="form-row">
            <span>What to show</span>
            <select value={headsUp.mode} onChange={(e) => changeHeadsUp({ mode: e.target.value })}>
              <option value="auto">Automatic: what's left today until 5 PM, tomorrow's after that</option>
              <option value="today">Today's remaining appointments</option>
              <option value="tomorrow">Tomorrow's appointments</option>
            </select>
          </label>
        )}
      </section>
      {!form && !error && <p className="muted">Loading…</p>}
      {form && (
        <form className="card" onSubmit={save}>
          <label className="form-row">
            <span>WhatsApp number for bookings</span>
            <input value={form.whatsapp_number} onChange={set("whatsapp_number")} inputMode="tel" placeholder="254702839214" />
            <small className="muted">Clients send their booking details to this number. It's saved as digits with the country code.</small>
          </label>

          <div className="form-inline">
            <label className="form-row">
              <span>Gap after each booking (minutes)</span>
              <input type="number" min="0" max="120" value={form.buffer_minutes} onChange={set("buffer_minutes")} />
            </label>
            <label className="form-row">
              <span>Earliest booking from now (minutes)</span>
              <input type="number" min="0" max="10080" value={form.min_notice_minutes} onChange={set("min_notice_minutes")} />
            </label>
            <label className="form-row">
              <span>Time between start times (minutes)</span>
              <input type="number" min="5" max="120" step="5" value={form.slot_interval_minutes} onChange={set("slot_interval_minutes")} />
            </label>
            <label className="form-row">
              <span>How many days ahead clients can book</span>
              <input type="number" min="1" max="365" value={form.max_days_ahead} onChange={set("max_days_ahead")} />
            </label>
          </div>
          <p className="muted">
            A gap pushes the next free start time later. For example, with 30-minute start times, a 10-minute gap
            means the next client can start 30 minutes after the first one ends.
          </p>

          {error && <p className="error-text" role="alert">{error}</p>}
          {saved && <p className="ok-text" role="status">Settings saved.</p>}
          <div className="actions"><button className="btn btn-primary" disabled={saving}>Save settings</button></div>
        </form>
      )}
      {!form && error && <p className="error-text" role="alert">{error}</p>}
    </Layout>
  );
}
