import { expect, test } from "@playwright/test";

// The key lives in the repo-root .env, outside the Next project directory.
// This asserts it reaches the process that serves the route, without calling
// Jev and without ever reading the value itself.
test("the classify route has its API key at runtime", async ({ request }) => {
  const response = await request.get("/api/classify");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ configured: true });
});

test("a request with no body is rejected before reaching the model", async ({ request }) => {
  const response = await request.post("/api/classify", { data: { subject: "x", body: "   " } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/body is required/i);
});
