import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HeadsUp from "../components/HeadsUp";
import { pickHeadsUp } from "../lib/headsUp";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({ api: { getBookings: vi.fn() } }));

// Monday 7 Jan 2030
const at = (h, m = 0) => new Date(2030, 0, 7, h, m);
const TODAY = "2030-01-07";
const TOMORROW = "2030-01-08";

function booking(id, date, start, end, over = {}) {
  return {
    id, customer_name: `Client ${id}`, status: "confirmed",
    start_time: `${date}T${start}:00`, end_time: `${date}T${end}:00`,
    items: [{ service_id: 1, service_name: "Gel polish" }], ...over,
  };
}

describe("pickHeadsUp", () => {
  const todayAm = booking(1, TODAY, "09:00", "10:00");
  const todayPm = booking(2, TODAY, "15:00", "16:00");
  const tomorrow1 = booking(3, TOMORROW, "10:00", "11:00");
  const tomorrow2 = booking(4, TOMORROW, "09:00", "10:00", { status: "pending" });
  const all = [todayAm, todayPm, tomorrow1, tomorrow2];

  it("auto, before 5pm: shows only what's left of today", () => {
    const pick = pickHeadsUp(all, at(12), "auto");
    expect(pick.label).toBe("Today");
    expect(pick.items.map((b) => b.id)).toEqual([2]); // the 9am one is already over
  });

  it("auto, after 5pm: switches to tomorrow, in time order", () => {
    const pick = pickHeadsUp(all, at(18), "auto");
    expect(pick.label).toBe("Tomorrow");
    expect(pick.items.map((b) => b.id)).toEqual([4, 3]);
  });

  it("auto: moves on to tomorrow once today is finished, even before 5pm", () => {
    expect(pickHeadsUp([todayAm, tomorrow1], at(14), "auto").label).toBe("Tomorrow");
  });

  it("auto: falls back to today's leftovers in the evening when tomorrow is empty", () => {
    const late = booking(5, TODAY, "18:00", "19:00");
    expect(pickHeadsUp([late], at(17, 30), "auto").label).toBe("Today");
  });

  it("returns nothing when there's nothing to show", () => {
    expect(pickHeadsUp([], at(18), "auto")).toBeNull();
    expect(pickHeadsUp([todayAm], at(18), "tomorrow")).toBeNull();
    expect(pickHeadsUp([tomorrow1], at(12), "today")).toBeNull();
  });

  it("ignores cancelled, done and no-show bookings", () => {
    const dead = [
      booking(6, TOMORROW, "10:00", "11:00", { status: "cancelled" }),
      booking(7, TOMORROW, "11:00", "12:00", { status: "no_show" }),
      booking(8, TOMORROW, "12:00", "13:00", { status: "completed" }),
    ];
    expect(pickHeadsUp(dead, at(18), "auto")).toBeNull();
  });

  it("a fixed mode ignores the time of day", () => {
    expect(pickHeadsUp(all, at(9), "tomorrow").label).toBe("Tomorrow");
    expect(pickHeadsUp(all, at(20), "today")).toBeNull(); // nothing of today left at 8pm
  });
});

describe("HeadsUp card", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at(18, 30));
  });
  afterEach(() => vi.useRealTimers());

  it("lists tomorrow's appointments and flags the ones still to confirm", async () => {
    api.getBookings.mockResolvedValue([
      booking(1, TOMORROW, "10:00", "11:00"),
      booking(2, TOMORROW, "09:00", "10:00", { status: "pending" }),
    ]);
    render(<HeadsUp onOpenDay={() => {}} />);

    expect(await screen.findByText("Tomorrow: 2 appointments")).toBeInTheDocument();
    expect(screen.getByText("1 to confirm")).toBeInTheDocument();
    const rows = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(rows[0]).toContain("9:00 AM");
    expect(rows[1]).toContain("10:00 AM");
    expect(api.getBookings).toHaveBeenCalledWith({ from_date: TODAY, to_date: TOMORROW });
  });

  it("shows nothing at all when there are no appointments", async () => {
    api.getBookings.mockResolvedValue([]);
    const { container } = render(<HeadsUp onOpenDay={() => {}} />);
    await waitFor(() => expect(api.getBookings).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("does nothing, not even fetch, when switched off", async () => {
    localStorage.setItem("dee_headsup_prefs", JSON.stringify({ enabled: false, mode: "auto" }));
    const { container } = render(<HeadsUp onOpenDay={() => {}} />);
    expect(api.getBookings).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("can be dismissed, and stays dismissed on reload", async () => {
    api.getBookings.mockResolvedValue([booking(1, TOMORROW, "10:00", "11:00")]);
    const { unmount } = render(<HeadsUp onOpenDay={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("region")).not.toBeInTheDocument();

    unmount();
    const { container } = render(<HeadsUp onOpenDay={() => {}} />);
    await waitFor(() => expect(api.getBookings).toHaveBeenCalledTimes(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the day it's talking about", async () => {
    api.getBookings.mockResolvedValue([booking(1, TOMORROW, "10:00", "11:00")]);
    const onOpenDay = vi.fn();
    render(<HeadsUp onOpenDay={onOpenDay} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open tomorrow" }));
    expect(onOpenDay).toHaveBeenCalledWith(TOMORROW);
  });
});
