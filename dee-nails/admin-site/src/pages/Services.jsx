import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api, imageUrl } from "../lib/api";
import { duration, money } from "../lib/format";

const EMPTY = { name: "", category: "", price: "", duration_minutes: "", description: "", is_active: true };

export default function Services() {
  const [services, setServices] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(null);          // a newly chosen file, not yet uploaded
  const [photoPreview, setPhotoPreview] = useState("");
  const [currentImage, setCurrentImage] = useState(null); // path of the saved photo when editing

  const load = () => api.getServices().then(setServices).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const categories = useMemo(
    () => [...new Set((services || []).map((s) => s.category).filter(Boolean))],
    [services]
  );

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function choosePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose a photo (JPG, PNG or WebP).");
    if (file.size > 8 * 1024 * 1024) return setError("That photo is over 8 MB. Choose a smaller one.");
    setError("");
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function removeCurrentPhoto() {
    setError("");
    try {
      await api.removeServiceImage(editingId);
      setCurrentImage(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setCurrentImage(s.image_url);
    setPhoto(null);
    setPhotoPreview("");
    setForm({
      name: s.name,
      category: s.category || "",
      price: String(s.price),
      duration_minutes: String(s.duration_minutes),
      description: s.description || "",
      is_active: s.is_active,
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
    setPhoto(null);
    setCurrentImage(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview("");
  }

  async function save(e) {
    e.preventDefault();
    setError("");
    const payload = {
      name: form.name.trim(),
      category: form.category.trim() || null,
      price: Number(form.price),
      duration_minutes: Number(form.duration_minutes),
      description: form.description.trim(),
      is_active: form.is_active,
    };
    if (!payload.name) return setError("Enter a service name.");
    if (!Number.isFinite(payload.price) || form.price === "") return setError("Enter a price.");
    if (!Number.isInteger(payload.duration_minutes) || payload.duration_minutes < 5) {
      return setError("Enter how long it takes, in whole minutes (at least 5).");
    }

    setSaving(true);
    try {
      const saved = editingId ? await api.updateService(editingId, payload) : await api.addService(payload);
      if (photo) {
        try {
          await api.uploadServiceImage(saved.id, photo);
        } catch (err) {
          // the service itself is saved; only the photo failed
          await load();
          if (!editingId) startEdit(saved);
          return setError(`Saved, but the photo wasn't uploaded: ${err.message}`);
        }
      }
      reset();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(s, active) {
    setError("");
    try {
      if (active) await api.updateService(s.id, { is_active: true });
      else await api.archiveService(s.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Layout>
      <h1>Services</h1>

      <form className="card" onSubmit={save}>
        <h2>{editingId ? "Edit service" : "Add a service"}</h2>
        <div className="form-inline">
          <label className="form-row"><span>Name</span>
            <input value={form.name} onChange={set("name")} maxLength={100} />
          </label>
          <label className="form-row"><span>Category</span>
            <input value={form.category} onChange={set("category")} list="categories" maxLength={50} placeholder="e.g. Manicure" />
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="form-row"><span>Price (KES)</span>
            <input type="number" min="0" value={form.price} onChange={set("price")} />
          </label>
          <label className="form-row"><span>Time it takes (minutes)</span>
            <input type="number" min="5" max="480" step="5" value={form.duration_minutes} onChange={set("duration_minutes")} />
          </label>
        </div>
        <label className="form-row"><span>Description (shown to clients)</span>
          <textarea rows={2} value={form.description} onChange={set("description")} maxLength={500} />
        </label>
        <div className="photo-row">
          {(photoPreview || currentImage) ? (
            <img className="thumb" src={photoPreview || imageUrl(currentImage)} alt="Service photo" />
          ) : (
            <div className="thumb thumb-empty" aria-hidden="true">No photo</div>
          )}
          <div>
            <label className="btn btn-sm file-btn">
              {photoPreview || currentImage ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*" onChange={choosePhoto} />
            </label>
            {editingId && currentImage && !photoPreview && (
              <button type="button" className="btn btn-sm" onClick={removeCurrentPhoto}>Remove photo</button>
            )}
            <p className="muted">From your gallery or camera. It's resized automatically.</p>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.is_active} onChange={set("is_active")} />
          Show on the booking site
        </label>
        {error && <p className="error-text" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn btn-primary" disabled={saving}>{editingId ? "Save changes" : "Add service"}</button>
          {editingId && <button type="button" className="btn" onClick={reset}>Cancel</button>}
        </div>
      </form>

      {services === null && !error && <p className="muted">Loading…</p>}
      {services && services.length === 0 && <p className="muted">No services yet. Add your first one above.</p>}

      {services && services.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Service</th><th>Price</th><th>Time</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {services.map((s) => (
                <tr key={s.id} className={s.is_active ? "" : "archived"}>
                  <td>
                    <div className="svc-cell">
                      {s.image_url ? <img className="thumb thumb-sm" src={imageUrl(s.image_url)} alt="" /> : <div className="thumb thumb-sm thumb-empty" aria-hidden="true" />}
                      <div>
                        <strong>{s.name}</strong>
                        {s.category && <div className="muted">{s.category}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{money(s.price)}</td>
                  <td>{duration(s.duration_minutes)}</td>
                  <td><span className={`badge ${s.is_active ? "badge-confirmed" : ""}`}>{s.is_active ? "Showing" : "Hidden"}</span></td>
                  <td className="row-actions">
                    <button className="btn btn-sm" onClick={() => startEdit(s)}>Edit</button>
                    {s.is_active ? (
                      <button className="btn btn-sm" onClick={() => setActive(s, false)}>Hide</button>
                    ) : (
                      <button className="btn btn-sm" onClick={() => setActive(s, true)}>Show again</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Hiding a service keeps past bookings intact. Clients just can't pick it any more.</p>
    </Layout>
  );
}
