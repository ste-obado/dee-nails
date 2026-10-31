import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Login from "../pages/Login";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: { login: vi.fn(), me: vi.fn() },
  setToken: vi.fn(),
  clearToken: vi.fn(),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe("Login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email and password fields", () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("shows an error and does not proceed when the account isn't an admin", async () => {
    api.login.mockResolvedValue({ access_token: "fake-token" });
    api.me.mockResolvedValue({ profile: { role: "user" } });

    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "customer@test.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/doesn't have admin access/i)).toBeInTheDocument();
    });
  });

  it("shows the server's error message on invalid credentials", async () => {
    api.login.mockRejectedValue(new Error("Invalid credentials"));

    renderLogin();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "admin@test.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument();
    });
  });
});
