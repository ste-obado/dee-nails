import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Services from "../pages/Services";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getServices: vi.fn(),
    addService: vi.fn(),
    updateService: vi.fn(),
    addServiceImage: vi.fn(),
    removeServiceImage: vi.fn(),
    reorderServiceImages: vi.fn(),
    archiveService: vi.fn(),
    logout: vi.fn(),
  },
  imageUrl: (p) => (p ? `http://api${p}` : null),
  clearToken: vi.fn(),
}));

const img = (id) => ({ id, url: `/uploads/services/${id}.webp` });
const svc = (over = {}) => ({ id: 7, name: "Gel polish", category: "Manicure", price: 1500, duration_minutes: 60, description: "", image_url: null, image_fit: "cover", images: [], is_active: true, ...over });

function fill() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gel polish" } });
  fireEvent.change(screen.getByLabelText("Price (KES)"), { target: { value: "1500" } });
  fireEvent.change(screen.getByLabelText("Time it takes (minutes)"), { target: { value: "60" } });
}

const file = (name = "nails.png", type = "image/png", size = 1000) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};
const chooser = () => document.querySelector('input[type="file"]');
const choose = (...files) => fireEvent.change(chooser(), { target: { files } });

describe("Services photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
    window.scrollTo = vi.fn();
    api.getServices.mockResolvedValue([]);
  });

  const renderPage = () => render(<MemoryRouter><Services /></MemoryRouter>);

  it("saves the service, then uploads every chosen photo in order", async () => {
    api.addService.mockResolvedValue(svc());
    api.addServiceImage.mockResolvedValue(svc());
    renderPage();
    await screen.findByText(/No services yet/);

    fill();
    const [a, b] = [file("a.png"), file("b.png")];
    choose(a, b);
    expect(await screen.findByText("Photos (2 of 4)")).toBeInTheDocument();
    expect(screen.getByText("Main (new)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => expect(api.addServiceImage).toHaveBeenCalledTimes(2));
    expect(api.addServiceImage.mock.calls.map((c) => c[1])).toEqual([a, b]);
    expect(api.addServiceImage.mock.calls.every((c) => c[0] === 7)).toBe(true);
    expect(api.addService).toHaveBeenCalledWith(expect.objectContaining({ image_fit: "cover" }));
  });

  it("stops offering uploads at four photos and skips extras", async () => {
    renderPage();
    await screen.findByText(/No services yet/);
    choose(file("1.png"), file("2.png"), file("3.png"), file("4.png"), file("5.png"));
    expect(await screen.findByText("Photos (4 of 4)")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("up to 4 photos");
    expect(chooser()).toBeNull();                       // no more "Add photo" slot
  });

  it("sends the chosen fit mode with the service", async () => {
    api.addService.mockResolvedValue(svc({ image_fit: "contain" }));
    renderPage();
    await screen.findByText(/No services yet/);
    fill();
    fireEvent.change(screen.getByLabelText("How photos are shown"), { target: { value: "contain" } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));
    await waitFor(() => expect(api.addService).toHaveBeenCalledWith(expect.objectContaining({ image_fit: "contain" })));
  });

  it("keeps the saved service and the unsent photos when an upload fails", async () => {
    api.addService.mockResolvedValue(svc());
    api.addServiceImage
      .mockResolvedValueOnce(svc({ images: [img(1)] }))
      .mockRejectedValueOnce(new Error("Please upload a JPG, PNG or WebP photo"));
    renderPage();
    await screen.findByText(/No services yet/);
    fill();
    choose(file("a.png"), file("b.png"), file("c.png"));
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Saved, but photo 2 wasn't uploaded");
    expect(screen.getByRole("heading", { name: "Edit service" })).toBeInTheDocument();
    expect(screen.getByText("Photos (3 of 4)")).toBeInTheDocument();   // 1 saved + 2 still waiting
  });

  it("refuses non-images and photos over 8 MB before uploading anything", async () => {
    renderPage();
    await screen.findByText(/No services yet/);
    choose(file("notes.pdf", "application/pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("photos only");
    choose(file("big.jpg", "image/jpeg", 9 * 1024 * 1024));
    expect(await screen.findByRole("alert")).toHaveTextContent("over 8 MB");
    expect(api.addServiceImage).not.toHaveBeenCalled();
  });

  it("shows saved photos when editing, makes one the main photo, and removes one", async () => {
    api.getServices.mockResolvedValue([svc({ images: [img(1), img(2), img(3)], image_url: "/uploads/services/1.webp" })]);
    api.reorderServiceImages.mockResolvedValue(svc({ images: [img(3), img(1), img(2)] }));
    api.removeServiceImage.mockResolvedValue(svc({ images: [img(3), img(2)] }));
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByText("Photos (3 of 4)")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();

    const third = screen.getByAltText("Photo 3").closest(".photo-slot");
    fireEvent.click(within(third).getByRole("button", { name: "Make main" }));
    await waitFor(() => expect(api.reorderServiceImages).toHaveBeenCalledWith(7, [3, 1, 2]));

    fireEvent.click(screen.getByRole("button", { name: "Remove photo 2" }));
    await waitFor(() => expect(api.removeServiceImage).toHaveBeenCalledWith(7, 1));
    expect(await screen.findByText("Photos (2 of 4)")).toBeInTheDocument();
  });
});
