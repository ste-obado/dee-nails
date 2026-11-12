import { useEffect, useMemo, useState } from "react";
import Layout from "../components/Layout";
import { api, imageUrl } from "../lib/api";
import { duration, money } from "../lib/format";

const MAX_PHOTOS = 4;
const MAX_BYTES = 8 * 1024 * 1024;
const EMPTY = { name: "", category: "", price: "", duration_minutes: "", description: "", image_fit: "cover", is_active: true };

export default function Services() {
  const [services, setServices] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState([]);     // photos already on the server (when editing): { id, url }
  const [pending, setPending] = useState([]); // photos chosen but not uploaded yet: { file, preview }

  const load = () => api.getServices().then(setServices).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const categories = useMemo(
    () => [...new Set((services || []).map((s) => s.category).filter(Boolean))],
    [services]
  );
  const totalPhotos = saved.length + pending.length;

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  function clearPending() {
    pending.forEach((p) => URL.revokeObjectURL(p.preview));
    setPending([]);
  }

  function choosePhotos(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // so choosing the same file again still triggers onChange
    if (!files.length) return;
    const room = MAX_PHOTOS - totalPhotos;
    const accepted = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) return setError("Please choose photos only (JPG, PNG or WebP).");
      if (file.size > MAX_BYTES) return setError("A photo is over 8 MB. Choose a smaller one.");
      accepted.push(file);
    }
    setError(accepted.length > room ? `A service can have up to ${MAX_PHOTOS} photos. Extra ones were skipped.` : "");
    setPending((prev) => [...prev, ...accepted.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
  }

  function dropPending(index) {
    setPending((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function removeSaved(imageId) {
    setError("");
    try {
      const updated = await api.removeServiceImage(editingId, imageId);
      setSaved(updated.images);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function makeFirst(imageId) {
    setError("");
    try {
      const ids = [imageId, ...saved.map((i) => i.id).filter((id) => id !== imageId)];
      const updated = await api.reorderServiceImages(editingId, ids);
      setSaved(updated.images);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(s) {
    clearPending();
    setEditingId(s.id);
    setSaved(s.images || []);
    setForm({
      name: s.name,
      category: s.category || "",
      price: String(s.price),
      duration_minutes: String(s.duration_minutes),
      description: s.description || "",
      image_fit: s.image_fit || "cover",
      is_active: s.is_active,
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    clearPending();
    setEditingId(null);
    setSaved([]);
    setForm(EMPTY);
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
      image_fit: form.image_fit,
      is_active: form.is_active,
    };
    if (!payload.name) return setError("Enter a service name.");
    if (!Number.isFinite(payload.price) || form.price === "") return setError("Enter a price.");
    if (!Number.isInteger(payload.duration_minutes) || payload.duration_minutes < 5) {
      return setError("Enter how long it takes, in whole minutes (at least 5).");
    }

    setSaving(true);
    try {
      const service = editingId ? await api.updateService(editingId, payload) : await api.addService(payload);
      let latest = service;
      for (let i = 0; i < pending.length; i++) {
        try {
          latest = await api.addServiceImage(service.id, pending[i].file);
        } catch (err) {
          // the service and earlier photos are saved; keep the rest to retry
          pending.slice(0, i).forEach((p) => URL.revokeObjectURL(p.preview));
          setPending(pending.slice(i));
          setEditingId(service.id);
          setSaved(latest.images || []);
          await load();
          return setError(`Saved, but photo ${i + 1} wasn't uploaded: ${err.message}`);
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

        <fieldset className="photos">
          <legend>Photos ({totalPhotos} of {MAX_PHOTOS})</legend>
          <div className="photo-grid">
            {saved.map((img, i) => (
              <div key={img.id} className="photo-slot">
                <img className={`thumb${form.image_fit === "contain" ? " contain" : ""}`} src={imageUrl(img.url)} alt={`Photo ${i + 1}`} />
                {i === 0 && <span className="cover-tag">Main</span>}
                <div className="slot-actions">
                  {i > 0 && <button type="button" className="btn btn-sm" onClick={() => makeFirst(img.id)}>Make main</button>}
                  <button type="button" className="btn btn-sm" onClick={() => removeSaved(img.id)} aria-label={`Remove photo ${i + 1}`}>Remove</button>
                </div>
              </div>
            ))}
            {pending.map((p, i) => (
              <div key={p.preview} className="photo-slot">
                <img className={`thumb${form.image_fit === "contain" ? " contain" : ""}`} src={p.preview} alt={`New photo ${i + 1}`} />
                <span className="cover-tag new">{saved.length + i === 0 ? "Main (new)" : "New"}</span>
                <div className="slot-actions">
                  <button type="button" className="btn btn-sm" onClick={() => dropPending(i)} aria-label={`Remove new photo ${i + 1}`}>Remove</button>
                </div>
              </div>
            ))}
            {totalPhotos < MAX_PHOTOS && (
              <label className="photo-slot photo-add">
                <span>+ Add photo</span>
                <input type="file" accept="image/*" multiple onChange={choosePhotos} />
              </label>
            )}
          </div>
          <p className="muted">The first photo is the main one in the menu. From your gallery or camera. Photos are resized automatically.</p>
          <label className="form-row"><span>How photos are shown</span>
            <select value={form.image_fit} onChange={set("image_fit")}>
              <option value="cover">Fill the frame (crops the edges)</option>
              <option value="contain">Show the whole photo on white (best for cut-out or white-background photos)</option>
            </select>
          </label>
        </fieldset>

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
                        <div className="muted">{[s.category, s.images?.length ? `${s.images.length} ${s.images.length === 1 ? "photo" : "photos"}` : null].filter(Boolean).join(", ")}</div>
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
