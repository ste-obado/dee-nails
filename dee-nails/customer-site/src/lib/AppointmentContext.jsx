import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import servicesSnapshot from "../data/services.snapshot.json";

const STORAGE_KEY = "dee_appointment";
const SERVICES_CACHE_KEY = "dee_services_cache";

function loadCachedServices() {
  try {
    const cached = JSON.parse(localStorage.getItem(SERVICES_CACHE_KEY) || "null");
    if (Array.isArray(cached)) return cached;
  } catch { /* use build-time snapshot */ }
  return Array.isArray(servicesSnapshot) ? servicesSnapshot : null;
}
const AppointmentContext = createContext(null);

function loadIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

/**
 * Holds "My appointment": the services the client has picked so far, plus the
 * service list and salon info fetched from the API. Only service IDs are
 * remembered between visits -- prices and durations always come fresh from the
 * server, and the server recalculates them again when the booking is made.
 */
export function AppointmentProvider({ children }) {
  const [services, setServices] = useState(loadCachedServices); // show cached/snapshot data before network response
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState(loadIds);

  const load = useCallback(() => {
    setError("");
    Promise.all([api.getServices(), api.getInfo()])
      .then(([svc, salon]) => {
        setServices(svc);
        try { localStorage.setItem(SERVICES_CACHE_KEY, JSON.stringify(svc)); } catch { /* cache is optional */ }
        setInfo(salon);
        // forget services Dee has since archived
        setSelectedIds((prev) => prev.filter((id) => svc.some((s) => s.id === id)));
      })
      .catch((err) => {
        // Keep cached/snapshot services visible while the API is waking or offline.
        setError(services === null ? err.message : "Showing saved services. Live updates are temporarily unavailable.");
      });
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedIds));
    } catch {
      // storage unavailable (private mode): the selection just won't persist
    }
  }, [selectedIds]);

  const selected = useMemo(
    () => (services || []).filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds]
  );

  const value = useMemo(
    () => ({
      services,
      info,
      error,
      reload: load,
      selected,
      selectedIds,
      totalMinutes: selected.reduce((sum, s) => sum + s.duration_minutes, 0),
      totalPrice: selected.reduce((sum, s) => sum + s.price, 0),
      toggle: (id) =>
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
      remove: (id) => setSelectedIds((prev) => prev.filter((x) => x !== id)),
      clear: () => setSelectedIds([]),
    }),
    [services, info, error, load, selected, selectedIds]
  );

  return <AppointmentContext.Provider value={value}>{children}</AppointmentContext.Provider>;
}

export function useAppointment() {
  const ctx = useContext(AppointmentContext);
  if (!ctx) throw new Error("useAppointment must be used inside AppointmentProvider");
  return ctx;
}
