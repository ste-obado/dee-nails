const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Service photos are stored by the backend and referenced by a relative path.
export const imageUrl = (path) =>
  path ? (/^https?:\/\//i.test(path) ? path : `${API_URL}${path}`) : null;

// FastAPI sends errors as {detail: "text"} or, for validation failures,
// {detail: [{msg: "Value error, Enter a valid ..."}]}. Turn both into one
// readable sentence for the client.
function errorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => String(d.msg || "").replace(/^Value error,\s*/i, "")).join(". ");
  }
  return `Something went wrong (${status}). Please try again.`;
}

async function request(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the booking server. Check your connection and try again.");
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new Error(errorMessage(data, res.status));
  return data;
}

export const api = {
  getServices: () => request("/services/"),
  getInfo: () => request("/schedule/info"),

  getSlots: (date, serviceIds) => {
    const q = new URLSearchParams({ date });
    serviceIds.forEach((id) => q.append("service_ids", id));
    return request(`/bookings/slots?${q.toString()}`);
  },

  lookupBooking: ({ reference, phone }) =>
    request("/bookings/lookup", { method: "POST", body: { reference, customer_phone: phone } }),

  createBooking: ({ name, phone, notes, serviceIds, startTime }) =>
    request("/bookings/", {
      method: "POST",
      body: {
        customer_name: name,
        customer_phone: phone,
        notes: notes || null,
        service_ids: serviceIds,
        start_time: startTime, // "2026-11-02T12:00:00" -- salon-local time, no timezone
      },
    }),
};
