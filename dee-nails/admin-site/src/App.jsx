import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Schedule from "./pages/Schedule";
import Services from "./pages/Services";
import Availability from "./pages/Availability";
import Settings from "./pages/Settings";
import { api, isLoggedIn, clearToken } from "./lib/api";

/**
 * A valid token only proves the person is a logged-in *someone* — it says
 * nothing about role. This re-checks /users/me on every protected route
 * load so a customer token (or an admin token that got demoted server-side)
 * can't sit in the admin panel just because it's a valid JWT.
 */
function ProtectedRoute({ children }) {
  const [status, setStatus] = useState("checking"); // checking | ok | denied

  useEffect(() => {
    if (!isLoggedIn()) {
      setStatus("denied");
      return;
    }
    api.me()
      .then(({ profile }) => setStatus(profile.role === "admin" ? "ok" : "denied"))
      .catch(() => setStatus("denied"));
  }, []);

  if (status === "checking") return null;
  if (status === "denied") {
    clearToken();
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
      <Route path="/services" element={<ProtectedRoute><Services /></ProtectedRoute>} />
      <Route path="/availability" element={<ProtectedRoute><Availability /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
    </Routes>
  );
}
