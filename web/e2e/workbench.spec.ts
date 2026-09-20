import { expect, test, type Page } from "@playwright/test";

/** The outage-gated ticket: urgent under the default thresholds. */
const URGENT_TICKET = "Issue with Investment Data Analytics Tools";

const openPolicyDrawer = async (page: Page) => {
  const urgent = page.getByRole("slider", { name: /urgent/i });
  if (!(await urgent.isVisible())) await page.getByRole("button", { name: /policy parameters/i }).click();
  await expect(urgent).toBeVisible();
};

/** The gate knobs sit behind the "held fixed in sweeps" disclosure. */
const openHeldFixed = async (page: Page) => {
  await openPolicyDrawer(page);
  const gate = page.getByRole("slider", { name: /outageAbove/i });
  if (!(await gate.isVisible())) await page.getByRole("button", { name: /held fixed in sweeps/i }).click();
  await expect(gate).toBeVisible();
};

test.describe("triage workbench", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: /triage workbench/i })).toBeVisible();
  });

  test("boots from the cached run with every ticket on one page", async ({ page }) => {
    await expect(page.getByText(/cached run/i)).toBeVisible();
    await expect(page.getByRole("row")).toHaveCount(61); // 60 tickets plus the header
    await expect(page.locator("#view-index").getByText(/no live run yet/i)).toBeVisible();
  });

  test("shows no accuracy metric, because the eval set carries no labels", async ({ page }) => {
    await expect(page.getByText(/exact match|urgent recall|routing accuracy/i)).toHaveCount(0);
  });

  test("dragging a threshold re-decides the ticket in the browser", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(URGENT_TICKET, "i") }).click();

    await expect(page.locator("[data-stat='priority'] dd")).toHaveText(/urgent/i);
    await expect(page.getByText(/forced by outage gate/i)).toBeVisible();

    // no request may leave the page while a threshold moves
    let requests = 0;
    page.on("request", () => (requests += 1));

    await openHeldFixed(page);
    const outage = page.getByRole("slider", { name: /outageAbove/i });
    await outage.focus();
    for (let i = 0; i < 25; i += 1) await page.keyboard.press("ArrowRight");

    await expect(page.getByText(/forced by outage gate/i)).toHaveCount(0);
    await expect(page.getByText(/from urgency/i)).toBeVisible();
    expect(requests).toBe(0);
  });

  test("the filter chips narrow the board", async ({ page }) => {
    // wait for the full board before measuring, or the count races the render
    await expect(page.getByRole("row")).toHaveCount(61);

    await page.getByRole("button", { name: "urgent", exact: true }).click();
    await expect(page.getByRole("row")).not.toHaveCount(61);

    const urgentOnly = await page.getByRole("row").count();
    expect(urgentOnly).toBeGreaterThan(1);
    expect(await page.getByText("urgent", { exact: true }).count()).toBeGreaterThan(0);
  });

  test("j, k and Escape walk the filtered set from the keyboard", async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(URGENT_TICKET, "i") }).click();
    const idLine = page.locator("#view-detail").getByText(/^hf-\d+$/);
    const first = await idLine.textContent();

    await page.keyboard.press("j");
    const second = await idLine.textContent();
    expect(second).not.toBe(first);

    await page.keyboard.press("k");
    await expect(idLine).toHaveText(first ?? "");

    await page.keyboard.press("Escape");
    await expect(page.locator("#view-index")).toBeVisible();
  });

  test("exactly one view is rendered at a time", async ({ page }) => {
    await expect(page.locator("#view-index")).toBeVisible();
    await expect(page.locator("#view-detail")).toBeHidden();
    await expect(page.locator("#view-compose")).toBeHidden();

    await page.getByRole("button", { name: /write your own ticket/i }).click();
    await expect(page.locator("#view-compose")).toBeVisible();
    await expect(page.locator("#view-index")).toBeHidden();
    await expect(page.locator("#view-detail")).toBeHidden();
  });

  test("compose enforces the same caps the route does", async ({ page }) => {
    await page.getByRole("button", { name: /write your own ticket/i }).click();

    const classify = page.getByRole("button", { name: /^classify$/i });
    await expect(classify).toBeDisabled(); // empty body

    await page.getByRole("button", { name: /sample 1/i }).click();
    await expect(classify).toBeEnabled();
    await expect(page.getByLabel(/^body$/i)).toHaveAttribute("maxlength", "5000");
    await expect(page.getByLabel(/^subject$/i)).toHaveAttribute("maxlength", "200");
  });

  test("moving a band threshold moves a ticket between bands", async ({ page }) => {
    // hf-12361 lands in a band from its urgency, with no gate involved
    await page.getByRole("button", { name: /request for software assistance/i }).click();
    await expect(page.getByText(/from urgency/i)).toBeVisible();

    const priority = page.locator("[data-stat='priority'] dd");
    const before = await priority.textContent();

    await openPolicyDrawer(page);
    const normal = page.getByRole("slider", { name: /normal/i });
    await normal.focus();
    for (let i = 0; i < 20; i += 1) await page.keyboard.press("ArrowLeft");

    await expect(priority).not.toHaveText(before ?? "");
  });

  test("every interactive target is at least 24 by 24", async ({ page }) => {
    await openHeldFixed(page);
    // the slider's pointer target is its control row, not the hidden range
    // input, so it is measured separately below
    const targets = page.locator("button:visible, a:visible, input:visible:not([type='range']), textarea:visible");
    const count = await targets.count();
    const undersized: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const node = targets.nth(i);
      const box = await node.boundingBox();
      if (!box) continue;
      if (box.width < 24 || box.height < 24) {
        undersized.push(`${(await node.textContent())?.trim() || (await node.getAttribute("aria-label"))} ${box.width}x${box.height}`);
      }
    }

    expect(undersized).toEqual([]);
  });

  test("each slider's pointer target is at least 24 tall", async ({ page }) => {
    await openHeldFixed(page);
    const controls = page.locator("[data-base-ui-slider-control]");
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const box = await controls.nth(i).boundingBox();
      expect(box?.height ?? 0, `slider ${i}`).toBeGreaterThanOrEqual(24);
    }
  });

  test("each slider renders exactly one thumb", async ({ page }) => {
    await openHeldFixed(page);
    const controls = await page.locator("[data-base-ui-slider-control]").count();
    const thumbs = await page.locator("[data-slot='slider-thumb']").count();
    expect(thumbs).toBe(controls);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the page reaches the same state without animation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: new RegExp(URGENT_TICKET, "i") }).click();

    // the static cue behind every animated change is still present
    await expect(page.getByText(/forced by outage gate/i)).toBeVisible();
    await expect(page.locator("#view-detail")).toBeVisible();
    await expect(page.locator("#view-detail")).toHaveCSS("opacity", "1");
  });
});
