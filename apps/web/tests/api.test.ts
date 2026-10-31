import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe("guest session and API failure handling", () => {
  it("deduplicates the guest handshake and includes its CSRF token on mutations", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: null, csrf_token: "guest-csrf" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "scenario-1" })),
      );
    vi.stubGlobal("fetch", fetch);
    const { session, request } = await import("../lib/api");
    const [first, second] = await Promise.all([session(), session()]);
    expect(first.csrf_token).toBe(second.csrf_token);
    expect(fetch).toHaveBeenCalledTimes(1);
    await request("/scenarios", "POST", { name: "Baseline" });
    expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("guest-csrf");
  });
  it("shows the backend human-readable validation message rather than an opaque status", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              detail: {
                code: "invalid_input",
                message: "Yield must be positive",
              },
            }),
            { status: 422 },
          ),
        ),
    );
    const { request } = await import("../lib/api");
    await expect(request("/scenarios")).rejects.toThrow(
      "Yield must be positive",
    );
  });
});
