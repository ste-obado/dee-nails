import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const STORAGE_KEY = "dee_appointment";
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
  const [services, setServices] = useState(null); // null = still loading
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState(loadIds);

  const load = useCallback(() => {
    setError("");
    Promise.all([api.getServices(), api.getInfo()])
      .then(([svc, salon]) => {
        setServices(svc);
        setInfo(salon);
        // forget services Dee has since archived
        setSelectedIds((prev) => prev.filter((id) => svc.some((s) => s.id === id)));
      })
      .catch((err) => setError(err.message));
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
