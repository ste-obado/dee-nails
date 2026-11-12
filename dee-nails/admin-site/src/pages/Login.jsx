import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, clearToken } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { access_token } = await api.login(email, password);
      setToken(access_token);

      // Being able to log in only proves valid credentials — it says
      // nothing about role. Confirm admin access before letting them in,
      // since a customer account can authenticate against the same API.
      const { profile } = await api.me();
      if (profile.role !== "admin") {
        clearToken();
        setError("This account doesn't have admin access.");
        return;
      }

      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <img className="login-logo" src="/logo-full-ink.png" alt="" width="180" height="204" />
        <h1>Dee Nails admin</h1>
        <p className="muted">Sign in with an admin account</p>

        <div className="form-row">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <p className="error-text">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", marginTop: 8 }}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
