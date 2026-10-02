import { afterEach, describe, expect, it } from "vitest";
import { sanitizeQuery, sanitizeReferer } from "./url-privacy";
const original = process.env.BOT_QUERY_ALLOWLIST;
afterEach(() => { if (original === undefined) delete process.env.BOT_QUERY_ALLOWLIST; else process.env.BOT_QUERY_ALLOWLIST = original; });
describe("future URL privacy", () => {
  it("strips credentials, query values and fragments by default", () => {
    delete process.env.BOT_QUERY_ALLOWLIST;
    expect(sanitizeQuery("token=secret&search=private")).toBe("");
    expect(sanitizeReferer("https://user:secret@example.com/path?token=secret#private")).toBe("https://example.com/path");
  });
  it("retains only an explicitly configured query key", () => {
    process.env.BOT_QUERY_ALLOWLIST = "page";
    expect(sanitizeQuery("token=secret&page=2")).toBe("page=2");
    expect(sanitizeReferer("https://example.com/?token=secret&page=2")).toBe("https://example.com/?page=2");
  });
});
