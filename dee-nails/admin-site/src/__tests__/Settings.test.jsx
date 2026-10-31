import { describe, it, expect } from "vitest";
import { cleanWhatsapp } from "../pages/Settings";

describe("cleanWhatsapp", () => {
  it("turns any common way of typing a Kenyan number into wa.me digits", () => {
    expect(cleanWhatsapp("+254 702 839 214")).toBe("254702839214");
    expect(cleanWhatsapp("0702 839214")).toBe("254702839214");
    expect(cleanWhatsapp("254702839214")).toBe("254702839214");
  });
  it("keeps an empty value empty so the number can be cleared", () => {
    expect(cleanWhatsapp("")).toBe("");
  });
});
