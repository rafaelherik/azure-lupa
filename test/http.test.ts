import { describe, expect, it, vi } from "vitest";

vi.mock("../src/server/azure/credentials.js", () => ({ getToken: async () => "tok" }));
const { armFetch, retryDelayMs } = await import("../src/server/azure/http.js");

describe("retryDelayMs", () => {
  it("honors Retry-After seconds", () => {
    expect(retryDelayMs(0, "3")).toBe(3000);
  });
  it("backs off exponentially without a header", () => {
    expect(retryDelayMs(2, null)).toBeGreaterThanOrEqual(2000);
  });
});

describe("armFetch", () => {
  it("retries on 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    await expect(armFetch({ path: "/x" }, fetchImpl as unknown as typeof fetch)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces Azure error messages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "AuthorizationFailed", message: "nope" } }), { status: 403 }),
    );
    await expect(armFetch({ path: "/y" }, fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({
      status: 403,
      code: "AuthorizationFailed",
      message: "nope",
    });
  });
});
