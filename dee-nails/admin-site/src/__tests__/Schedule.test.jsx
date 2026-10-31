import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Schedule from "../pages/Schedule";
import { api } from "../lib/api";
import { toISODate } from "../lib/format";

vi.mock("../lib/api", () => ({
  api: {
    getBookings: vi.fn(),
    getBlockedTimes: vi.fn(),
    setBookingStatus: vi.fn(),
    rescheduleBooking: vi.fn(),
    logout: vi.fn(),
  },
  clearToken: vi.fn(),
}));

const today = toISODate(new Date());

function booking(over = {}) {
  return {
    id: 1,
    reference: "DN-ABC123",
    customer_name: "Amina Wanjiku",
    customer_phone: "254712345678",
    notes: null,
    start_time: `${today}T12:00:00`,
    end_time: `${today}T13:00:00`,
    total_price: 1500,
    total_duration_minutes: 60,
    status: "pending",
    cancel_reason: null,
    items: [{ service_id: 1, service_name: "Gel polish", price: 1500, duration_minutes: 60 }],
    ...over,
  };
}

function renderSchedule() {
  return render(
    <MemoryRouter>
      <Schedule />
    </MemoryRouter>
  );
}

describe("Schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("dee_headsup_prefs", JSON.stringify({ enabled: false, mode: "auto" })); // covered in HeadsUp.test.jsx
    api.getBlockedTimes.mockResolvedValue([]);
  });

  it("lists the day's bookings in time order with who booked and what", async () => {
    api.getBookings.mockResolvedValue([
      booking({ id: 2, customer_name: "Later Client", start_time: `${today}T15:00:00`, end_time: `${today}T16:00:00`, status: "confirmed" }),
      booking({ id: 1, customer_name: "Earlier Client", start_time: `${today}T10:00:00`, end_time: `${today}T11:00:00` }),
    ]);
    renderSchedule();

    await screen.findByText("Earlier Client");
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names).toEqual(["Earlier Client", "Later Client"]);
    expect(screen.getAllByText(/Gel polish/)).toHaveLength(2);
    expect(screen.getByText(/2 bookings/)).toBeInTheDocument();
    expect(screen.getByText(/1 to confirm/)).toBeInTheDocument();
    expect(screen.getAllByText("+254712345678")[0]).toHaveAttribute("href", "tel:+254712345678");
  });

  it("confirms a booking and offers a WhatsApp message to the client", async () => {
    api.getBookings.mockResolvedValue([booking()]);
    api.setBookingStatus.mockResolvedValue({
      booking: booking({ status: "confirmed" }),
      whatsapp_url: "https://wa.me/254712345678?text=confirmed",
    });
    renderSchedule();

    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    const link = await screen.findByRole("link", { name: "Message on WhatsApp" });
    expect(link).toHaveAttribute("href", "https://wa.me/254712345678?text=confirmed");
    expect(api.setBookingStatus).toHaveBeenCalledWith(1, "confirmed");
    expect(screen.getByRole("status")).toHaveTextContent("Amina Wanjiku");
  });

  it("cancels with a reason after opening the cancel panel", async () => {
    api.getBookings.mockResolvedValue([booking({ status: "confirmed" })]);
    api.setBookingStatus.mockResolvedValue({
      booking: booking({ status: "cancelled" }),
      whatsapp_url: "https://wa.me/254712345678?text=cancelled",
    });
    renderSchedule();

    fireEvent.click(await screen.findByRole("button", { name: "Cancel booking" }));
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: "Stock delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel this booking" }));

    await waitFor(() => expect(api.setBookingStatus).toHaveBeenCalledWith(1, "cancelled", "Stock delivery"));
    expect(await screen.findByRole("link", { name: "Message on WhatsApp" })).toBeInTheDocument();
  });

  it("reschedules to the chosen date and time", async () => {
    api.getBookings.mockResolvedValue([booking()]);
    api.rescheduleBooking.mockResolvedValue({ booking: booking(), whatsapp_url: "https://wa.me/254712345678?text=moved" });
    renderSchedule();

    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.change(screen.getByLabelText("New date"), { target: { value: "2030-01-07" } });
    fireEvent.change(screen.getByLabelText("New start time"), { target: { value: "15:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Move booking" }));

    await waitFor(() => expect(api.rescheduleBooking).toHaveBeenCalledWith(1, "2030-01-07T15:30:00"));
  });

  it("shows the server's message when a reschedule clashes", async () => {
    api.getBookings.mockResolvedValue([booking()]);
    api.rescheduleBooking.mockRejectedValue(new Error("That time clashes with another booking or blocked time"));
    renderSchedule();

    fireEvent.click(await screen.findByRole("button", { name: "Reschedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Move booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("clashes with another booking");
  });

  it("hides cancelled bookings until asked", async () => {
    api.getBookings.mockResolvedValue([
      booking({ id: 1, customer_name: "Active Client" }),
      booking({ id: 2, customer_name: "Cancelled Client", status: "cancelled", cancel_reason: "Sick" }),
    ]);
    renderSchedule();

    await screen.findByText("Active Client");
    expect(screen.queryByText("Cancelled Client")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Show cancelled/));
    expect(screen.getByText("Cancelled Client")).toBeInTheDocument();
    expect(screen.getByText(/Reason: Sick/)).toBeInTheDocument();
  });

  it("shows time off between bookings, and nothing-booked when the day is empty", async () => {
    api.getBookings.mockResolvedValue([]);
    api.getBlockedTimes.mockResolvedValue([
      { id: 9, start_time: `${today}T13:00:00`, end_time: `${today}T14:00:00`, reason: "Lunch" },
    ]);
    renderSchedule();

    const row = (await screen.findByText("Time off")).closest(".timeoff");
    expect(within(row).getByText(/1:00 PM to 2:00 PM/)).toBeInTheDocument();
    expect(within(row).getByText("Lunch")).toBeInTheDocument();
  });

  it("switches to the week view and groups bookings by day", async () => {
    api.getBookings.mockResolvedValue([booking()]);
    renderSchedule();
    await screen.findByText("Amina Wanjiku");

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    await waitFor(() => expect(api.getBookings).toHaveBeenCalledTimes(2));
    expect(screen.getAllByRole("button", { name: "Open day" })).toHaveLength(7);
  });
});
