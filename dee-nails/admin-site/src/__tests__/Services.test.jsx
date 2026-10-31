import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Services from "../pages/Services";
import { api } from "../lib/api";

vi.mock("../lib/api", () => ({
  api: {
    getServices: vi.fn(),
    addService: vi.fn(),
    updateService: vi.fn(),
    uploadServiceImage: vi.fn(),
    removeServiceImage: vi.fn(),
    archiveService: vi.fn(),
    logout: vi.fn(),
  },
  imageUrl: (p) => (p ? `http://api${p}` : null),
  clearToken: vi.fn(),
}));

const svc = (over = {}) => ({ id: 7, name: "Gel polish", category: "Manicure", price: 1500, duration_minutes: 60, description: "", image_url: null, is_active: true, ...over });

function fill() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gel polish" } });
  fireEvent.change(screen.getByLabelText("Price (KES)"), { target: { value: "1500" } });
  fireEvent.change(screen.getByLabelText("Time it takes (minutes)"), { target: { value: "60" } });
}

const photoFile = (name = "nails.png", type = "image/png", size = 1000) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("Services photos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    api.getServices.mockResolvedValue([]);
  });

  const renderPage = () => render(<MemoryRouter><Services /></MemoryRouter>);

  it("saves the service, then uploads the chosen photo to the new service", async () => {
    api.addService.mockResolvedValue(svc());
    api.uploadServiceImage.mockResolvedValue(svc({ image_url: "/uploads/services/a.webp" }));
    renderPage();
    await screen.findByText(/No services yet/);

    fill();
    const file = photoFile();
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    expect(await screen.findByAltText("Service photo")).toHaveAttribute("src", "blob:preview");
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    await waitFor(() => expect(api.uploadServiceImage).toHaveBeenCalledWith(7, file));
    expect(api.addService).toHaveBeenCalledWith(expect.not.objectContaining({ image_url: expect.anything() }));
  });

  it("keeps the saved service and explains when only the photo upload fails", async () => {
    api.addService.mockResolvedValue(svc());
    api.uploadServiceImage.mockRejectedValue(new Error("Please upload a JPG, PNG or WebP photo"));
    renderPage();
    await screen.findByText(/No services yet/);

    fill();
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [photoFile()] } });
    fireEvent.click(screen.getByRole("button", { name: "Add service" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Saved, but the photo wasn't uploaded");
    expect(screen.getByRole("heading", { name: "Edit service" })).toBeInTheDocument(); // can retry without re-adding
  });

  it("refuses non-images and photos over 8 MB before uploading anything", async () => {
    renderPage();
    await screen.findByText(/No services yet/);
    const input = document.querySelector('input[type="file"]');

    fireEvent.change(input, { target: { files: [photoFile("notes.pdf", "application/pdf")] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("choose a photo");

    fireEvent.change(input, { target: { files: [photoFile("big.jpg", "image/jpeg", 9 * 1024 * 1024)] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("over 8 MB");
    expect(api.uploadServiceImage).not.toHaveBeenCalled();
  });

  it("shows an existing photo when editing and can remove it", async () => {
    api.getServices.mockResolvedValue([svc({ image_url: "/uploads/services/a.webp" })]);
    api.removeServiceImage.mockResolvedValue(svc());
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByAltText("Service photo")).toHaveAttribute("src", "http://api/uploads/services/a.webp");
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(api.removeServiceImage).toHaveBeenCalledWith(7));
  });
});
