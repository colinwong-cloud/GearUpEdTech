import { expect, test } from "@playwright/test";

test.describe("API route smoke", () => {
  test("core API routes are reachable", async ({ request }) => {
    const adminSessionRes = await request.get("/api/admin/session");
    expect([200, 401]).toContain(adminSessionRes.status());

    const shareEventRes = await request.post("/api/share-events", {
      data: {},
    });
    expect([202, 400]).toContain(shareEventRes.status());

    const wechatConfigRes = await request.post("/api/wechat/share-config", {
      data: {},
    });
    expect([400, 502, 503]).toContain(wechatConfigRes.status());
  });
});
