import { expect, type Page } from "@playwright/test";

export async function openClassifiedTicket(page: Page, destination = "billing", ticketId = "hf-8193") {
  await page.goto("/");
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 60_000 });
  await page.locator(`[data-card="${destination}"] h2 button`).click();
  const sheet = page.getByRole("complementary");
  await sheet.getByRole("searchbox", { name: /search tickets/i }).fill(ticketId);
  await sheet.locator(`a[href="/tickets/${ticketId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/tickets/${ticketId}$`));
  await expect(page.getByText(/scored judgments/i)).toBeVisible();
}
