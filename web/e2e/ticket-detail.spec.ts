import { expect, test } from "@playwright/test";
import { openCompose } from "./open-compose";
import { openClassifiedTicket } from "./open-classified-ticket";

const answers = {
  has_request: { type: "noul", noul: 0.9 },
  is_security_or_data_loss: { type: "noul", noul: 0.1 },
  is_outage: { type: "noul", noul: 0.1 },
  impact_severity: { type: "score", score: 3, confidence: 0.9, probabilities: { "2": 0.1, "3": 0.8, "4": 0.1 } },
  time_pressure: { type: "score", score: 2, confidence: 0.82, probabilities: { "1": 0.1, "2": 0.8, "3": 0.1 } },
  customer_frustration: { type: "score", score: 1, confidence: 0.77, probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 } },
  team: { type: "choice", choice: "billing", confidence: 0.9, probabilities: { billing: 0.9, sales: 0.1 } },
};

test.use({ reducedMotion: "reduce" });

for (const state of ["weighted", "security", "outage", "junk", "uncertain", "at-floor"] as const) {
  test(`ticket detail explains the ${state} decision`, async ({ page }) => {
    const response = {
      ...answers,
      ...(state === "security" || state === "junk" ? { is_security_or_data_loss: { type: "noul", noul: 0.95 } } : {}),
      ...(state === "outage" ? { is_outage: { type: "noul", noul: 0.95 } } : {}),
      ...(state === "junk" ? { has_request: { type: "noul", noul: 0.1 } } : {}),
      ...(state === "uncertain" || state === "at-floor" ? { team: { ...answers.team, confidence: state === "uncertain" ? 0.5 : 0.6 } } : {}),
    };
    await page.route("**/api/classify", (route) => route.fulfill({ json: { model: "stub", answers: response, latencyMs: 120 } }));
    await page.route("**/api/classify/run", (route) => {
      const { tickets } = route.request().postDataJSON() as { tickets: { id: string }[] };
      return route.fulfill({
        contentType: "application/x-ndjson",
        body: `${[
          JSON.stringify({ type: "open", concurrency: 8 }),
          ...tickets.flatMap(({ id }) => [
            JSON.stringify({ type: "start", id }),
            JSON.stringify({ type: "done", id, model: "stub", answers: response, latencyMs: 120 }),
          ]),
        ].join("\n")}\n`,
      });
    });
    await openClassifiedTicket(page, state === "junk" || state === "uncertain" ? "none" : "billing");
    const priority = page.locator('[data-stat="priority"] dd');
    await expect(priority).toContainText(state === "junk" ? "low" : state === "security" || state === "outage" ? "urgent" : "high");
    await expect(page.getByRole("img", { name: /Impact:.*contributes 0.450 points/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Time pressure:.*contributes 0.200 points/ })).toBeVisible();
    await expect(page.getByRole("img", { name: /Frustration:.*contributes 0.033 points/ })).toBeVisible();
    if (state === "junk") {
      await expect(page.getByText("Routing skipped. No actionable request detected.")).toBeVisible();
      await expect(page.getByText("Assigned to billing.")).toHaveCount(0);
    } else if (state === "uncertain") {
      await expect(page.getByText("Held for manual triage.")).toBeVisible();
    } else {
      await expect(page.getByText("Assigned to billing.")).toBeVisible();
    }
    if (state === "at-floor") await expect(page.getByText("Meets the 60% minimum for automatic routing.")).toBeVisible();
  });
}

test("long ticket text wraps on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.route("**/api/classify", (route) => route.fulfill({ json: { model: "stub", answers, latencyMs: 120 } }));
  await openCompose(page);
  await page.getByLabel(/^subject$/i).fill("A".repeat(200));
  await page.getByLabel(/^body$/i).fill("B".repeat(5000));
  await page.getByRole("button", { name: /^classify$/i }).click();
  await expect(page.getByRole("heading", { name: "A".repeat(200) })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

test("an inbox ticket opens without classification and its back link works by keyboard", async ({ page }) => {
  let requests = 0;
  await page.route(/\/api\/classify(?:\/run)?$/, (route) => {
    requests += 1;
    return route.fulfill({ json: { model: "stub", answers, latencyMs: 120 } });
  });
  await page.goto("/");
  await page.locator('[data-card="inbox"] h2 button').click();
  const sheet = page.getByRole("complementary");
  await sheet.getByRole("searchbox", { name: /search tickets/i }).fill("hf-8193");
  await sheet.locator('a[href="/tickets/hf-8193"]').click();
  await expect(page.getByRole("heading", { name: "Assistance Required from Customer Support" })).toBeVisible();
  await expect(page.getByText("Not classified", { exact: true })).toBeVisible();
  await expect(page.getByText(/Would you be able to supply comprehensive documentation/)).toBeVisible();
  await expect(page.getByText(/scored judgments/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Triage floor", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-card="inbox"] h2 + span')).toHaveText("50");
  expect(requests).toBe(0);
});
