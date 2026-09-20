import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [320, 375, 768, 1024, 1440, 1920] as const;
const THEMES = ["light", "dark"] as const;

// Themes come from the emulated OS preference, which is applied before first
// paint. Flipping [data-theme] by hand after load let axe race the restyle.

// The mockup was never seen at any width but 1280, so these are the first real
// measurements at anything else.
test.describe("responsive", () => {
  for (const width of WIDTHS) {
    test(`no horizontal overflow at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test(`the detail view fits at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.getByRole("button", { name: /issue with investment data/i }).click();
      await expect(page.getByText(/scored judgments/i)).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }

  test("the page keeps a side gutter at every width", async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const gutter = await page.locator(".gutter").evaluate((node) =>
        Number.parseFloat(getComputedStyle(node).paddingInlineStart),
      );
      expect(gutter, `gutter at ${width}`).toBeGreaterThanOrEqual(24);
    }
  });
});

for (const theme of THEMES) {
  test.describe(`visual regression, ${theme}`, () => {
    // `animations: "disabled"` freezes CSS animations, not GSAP's JS
    // transforms, so without this the entrance stagger lands in the baseline
    // and the comparison is flaky. Reduced motion skips it and settles.
    test.use({ reducedMotion: "reduce", colorScheme: theme });

    for (const width of [320, 768, 1024, 1440] as const) {
      test(`index at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page).toHaveScreenshot(`index-${width}-${theme}.png`, {
          fullPage: false,
          animations: "disabled",
        });
      });

      test(`detail at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await page.getByRole("button", { name: /issue with investment data/i }).click();
        await expect(page.getByText(/scored judgments/i)).toBeVisible();
        await expect(page).toHaveScreenshot(`detail-${width}-${theme}.png`, {
          fullPage: false,
          animations: "disabled",
        });
      });
    }
  });
}

const audit = (page: Page) =>
  new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();

for (const theme of THEMES) {
  test.describe(`accessibility, ${theme}`, () => {
    // Reduced motion settles the page immediately. Auditing mid-entrance
    // measures a fading element's composited colour, not the palette.
    test.use({ reducedMotion: "reduce", colorScheme: theme });

    test("the index has no axe violation", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { violations } = await audit(page);
      expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test("the detail view has no axe violation", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: /issue with investment data/i }).click();
      await expect(page.getByText(/scored judgments/i)).toBeVisible();
      const { violations } = await audit(page);
      expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test("the [data-theme] override resolves the same palette", async ({ page }) => {
      await page.goto("/");
      const viaMedia = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
      const viaAttribute = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(viaAttribute).toBe(viaMedia);
    });
  });
}

test.describe("accessibility", () => {
  test.use({ reducedMotion: "reduce" });

  test("the policy drawer and compose form pass too", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /policy parameters/i }).click();
    await page.getByRole("button", { name: /write your own ticket/i }).click();
    await expect(page.getByLabel(/^body$/i)).toBeVisible();
    const { violations } = await audit(page);
    expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("heading levels descend without skipping", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /issue with investment data/i }).click();
    await expect(page.getByText(/scored judgments/i)).toBeVisible();

    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .map((node) => Number(node.tagName[1])),
    );

    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!, `heading ${i}: ${levels.join(",")}`).toBeLessThanOrEqual(1);
    }
  });

  test("there is exactly one main landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toHaveCount(1);
  });

  test("keyboard focus reaches the board and shows an indicator", async ({ page }) => {
    await page.goto("/");
    const firstRow = page.getByRole("button", { name: /hf-26812/i });
    await firstRow.focus();
    await expect(firstRow).toBeFocused();

    const outline = await firstRow.evaluate((node) => {
      const style = getComputedStyle(node);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline.style).not.toBe("none");
    expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
  });

  test("aria-current is never set to false", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[aria-current='false']")).toHaveCount(0);
  });
});
