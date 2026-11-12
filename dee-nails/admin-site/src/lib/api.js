const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Service photos are stored by the backend and referenced by a relative path.
export const imageUrl = (path) =>
  path ? (/^https?:\/\//i.test(path) ? path : `${API_URL}${path}`) : null;

function getToken() {
  return localStorage.getItem("admin_token");
}

export function setToken(token) {
  localStorage.setItem("admin_token", token);
}

export function clearToken() {
  localStorage.removeItem("admin_token");
}

export function isLoggedIn() {
  return Boolean(getToken());
}

/**
 * Thin fetch wrapper: attaches the admin's bearer token, parses JSON,
 * and throws a readable Error on non-2xx responses so callers can just
 * try/catch instead of checking response.ok everywhere.
 */
async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token = getToken();

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      // a FormData upload must NOT get a Content-Type: the browser adds it,
      // including the multipart boundary the server needs
      ...(body instanceof FormData
        ? {}
        : body instanceof URLSearchParams
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body
      ? body instanceof URLSearchParams || body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Session expired, please log in again");
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) throw new Error(errorMessage(data, res.status));

  return data;
}

// FastAPI sends {detail: "text"} or, for validation failures,
// {detail: [{msg: "Value error, ..."}]}. Turn both into one readable sentence.
function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => String(d.msg || "").replace(/^Value error,\s*/i, "")).join(". ");
  }
  return `Request failed (${status})`;
}

function toQuery(params) {
  const q = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  login: (email, password) => {
    const form = new URLSearchParams();
    form.set("username", email);
    form.set("password", password);
    return request("/auth/login", { method: "POST", body: form });
  },
  me: () => request("/users/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  // services
  getServices: () => request("/services/admin/all"),
  addService: (service) => request("/services/", { method: "POST", body: service }),
  updateService: (id, updates) => request(`/services/${id}`, { method: "PATCH", body: updates }),
  // up to 4 photos per service; each call returns the updated service (with `images`)
  addServiceImage: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/services/${id}/images`, { method: "POST", body: form });
  },
  removeServiceImage: (id, imageId) => request(`/services/${id}/images/${imageId}`, { method: "DELETE" }),
  reorderServiceImages: (id, imageIds) =>
    request(`/services/${id}/images/order`, { method: "PUT", body: { image_ids: imageIds } }),
  archiveService: (id) => request(`/services/${id}`, { method: "DELETE" }),

  // bookings. The status/reschedule calls return { booking, whatsapp_url }:
  // a link that opens WhatsApp to the CLIENT with the message already typed.
  getBookings: (params) => request(`/bookings/admin${toQuery(params)}`),
  setBookingStatus: (id, status, reason) =>
    request(`/bookings/admin/${id}/status`, { method: "PATCH", body: { status, reason: reason || null } }),
  rescheduleBooking: (id, startTime) =>
    request(`/bookings/admin/${id}/reschedule`, { method: "POST", body: { start_time: startTime } }),

  // schedule
  getSettings: () => request("/schedule/admin/settings"),
  updateSettings: (updates) => request("/schedule/admin/settings", { method: "PATCH", body: updates }),
  getWorkingHours: () => request("/schedule/admin/working-hours"),
  updateWorkingHours: (days) => request("/schedule/admin/working-hours", { method: "PUT", body: { days } }),
  getBlockedTimes: () => request("/schedule/admin/blocked-times"),
  addBlockedTime: (block) => request("/schedule/admin/blocked-times", { method: "POST", body: block }),
  deleteBlockedTime: (id) => request(`/schedule/admin/blocked-times/${id}`, { method: "DELETE" }),
};
