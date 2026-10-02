import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./route";
const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });
describe("container login redirects", () => {
  it("uses a same-origin relative redirect for successful and failed login", async () => {
    const token = "t".repeat(32);
    process.env.BOT_ADMIN_TOKEN = token;
    for (const value of ["wrong", token]) {
      const request = new Request("http://0.0.0.0:3000/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-host": "untrusted.example" }, body: new URLSearchParams({ token: value }) });
      const res = await POST(request);
      expect(res.status).toBe(303);
      expect(res.headers.get("Location")).toBe(value === token ? "/dashboard" : "/dashboard?error=invalid");
    }
  });
});
