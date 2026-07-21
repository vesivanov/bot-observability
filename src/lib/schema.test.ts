import { describe, expect, it } from "vitest";
import { statusClassOf } from "./schema";

describe("statusClassOf", () => {
  it("classifies 2xx", () => {
    expect(statusClassOf(200)).toBe("2xx");
  });

  it("classifies 3xx", () => {
    expect(statusClassOf(301)).toBe("3xx");
  });

  it("classifies 4xx", () => {
    expect(statusClassOf(404)).toBe("4xx");
  });

  it("classifies 5xx", () => {
    expect(statusClassOf(503)).toBe("5xx");
  });

  it("classifies 0 as unknown", () => {
    expect(statusClassOf(0)).toBe("unknown");
  });

  it("classifies sub-200 codes as unknown", () => {
    expect(statusClassOf(199)).toBe("unknown");
  });
});
