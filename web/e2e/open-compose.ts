import { expect, type Page } from "@playwright/test";

/** Writing a ticket is a window over the floor, not an address of its own. */
export async function openCompose(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /write your own ticket/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
