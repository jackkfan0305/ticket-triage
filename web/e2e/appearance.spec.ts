import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WIDTHS = [320, 375, 430, 768, 1024, 1440, 1920] as const;
const THEMES = ["light", "dark"] as const;

// Themes come from the emulated OS preference, which is applied before first
// paint. Flipping [data-theme] by hand after load let axe race the restyle.

/** A ticket that exists in the eval set, for the route that renders one. */
const TICKET = "hf-8193";

/** The route classifies on a cold load; the shape of the answer is not what
 *  these tests are about, so it is stubbed and held still. */
const stubClassify = (page: Page) =>
  page.route("**/api/classify", (route) =>
    route.fulfill({
      json: {
        model: "stub-1",
        answers: {
          has_request: { type: "noul", noul: 0.9 },
          is_security_or_data_loss: { type: "noul", noul: 0.1 },
          is_outage: { type: "noul", noul: 0.1 },
          impact_severity: { type: "score", score: 3, confidence: 0.9, probabilities: { "0": 1 } },
          time_pressure: { type: "score", score: 2, confidence: 0.82, probabilities: { "0": 1 } },
          customer_frustration: { type: "score", score: 1, confidence: 0.77, probabilities: { "0": 1 } },
          team: { type: "choice", choice: "billing", confidence: 0.9, probabilities: { billing: 0.9 } },
        },
        latencyMs: 120,
      },
    }),
  );

const showDev = (page: Page) => page.getByRole("button", { name: /show developer mode/i }).click();

const overflowOf = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Every floating panel's own box, so two of them can be checked for overlap. */
const panelBoxes = (page: Page) =>
  page.locator(".hud > *").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }),
  );

const overlapsIn = (boxes: { x: number; y: number; w: number; h: number }[]) => {
  const found: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i] as { x: number; y: number; w: number; h: number };
      const b = boxes[j] as { x: number; y: number; w: number; h: number };
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) found.push(`${i}/${j}`);
    }
  }
  return found;
};

test.describe("responsive", () => {
  for (const width of WIDTHS) {
    test(`the chrome fits at ${width} with nothing overlapping`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      expect(await overflowOf(page), `overflow at ${width}`).toBeLessThanOrEqual(0);
      expect(overlapsIn(await panelBoxes(page)), `overlap at ${width}`).toEqual([]);

      // the developer panel is the widest thing the chrome ever shows
      await showDev(page);
      await page.waitForTimeout(200);
      expect(await overflowOf(page), `overflow at ${width}, developer mode`).toBeLessThanOrEqual(0);
      expect(overlapsIn(await panelBoxes(page)), `overlap at ${width}, developer mode`).toEqual([]);
    });

    test(`a ticket's own page fits at ${width}`, async ({ page }) => {
      await stubClassify(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/tickets/${TICKET}`);
      await expect(page.getByText(/scored judgments/i)).toBeVisible();
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    });

    test(`the compose view fits at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compose");
      await expect(page.getByLabel(/^body$/i)).toBeVisible();
      expect(await overflowOf(page)).toBeLessThanOrEqual(0);
    });
  }

  test("the document views keep a side gutter at every width", async ({ page }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/compose");
      const gutter = await page
        .locator("main")
        .evaluate((node) => Number.parseFloat(getComputedStyle(node).paddingInlineStart));
      expect(gutter, `gutter at ${width}`).toBeGreaterThanOrEqual(24);
    }
  });
});

test.describe("typography", () => {
  test("Inter is the only family on the page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const families = await page.evaluate(() =>
      [...document.querySelectorAll("body, h1, h2, .num, button, p")].map(
        (node) => getComputedStyle(node).fontFamily,
      ),
    );
    expect(families.length).toBeGreaterThan(5);
    for (const family of families) {
      expect(family.toLowerCase()).toContain("inter");
      expect(family.toLowerCase()).not.toContain("plex");
      expect(family.toLowerCase()).not.toContain("mono");
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
      test(`the floor at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/");
        await expect(page.locator("[data-card]")).toHaveCount(8);
        await expect(page.locator(".origin-top-left")).toHaveAttribute("style", /scale\(/);
        await expect(page).toHaveScreenshot(`index-${width}-${theme}.png`, {
          fullPage: false,
          animations: "disabled",
        });
      });

      test(`a ticket's own page at ${width}`, async ({ page }) => {
        await stubClassify(page);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/tickets/${TICKET}`);
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

    test("the floor has no axe violation", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const { violations } = await audit(page);
      expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });

    test("the developer panel has no axe violation", async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await showDev(page);
      await page.getByRole("button", { name: /policy parameters/i }).click();
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
  test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

  test("a ticket's own page has no axe violation", async ({ page }) => {
    await stubClassify(page);
    await page.goto(`/tickets/${TICKET}`);
    await expect(page.getByText(/scored judgments/i)).toBeVisible();
    const { violations } = await audit(page);
    expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("a ticket's own page descends from its own h1", async ({ page }) => {
    await stubClassify(page);
    await page.goto(`/tickets/${TICKET}`);
    await expect(page.getByText(/scored judgments/i)).toBeVisible();
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((node) => Number(node.tagName[1])),
    );
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i]! - levels[i - 1]!, `heading ${i}: ${levels.join(",")}`).toBeLessThanOrEqual(1);
    }
  });

  test("the compose form passes too", async ({ page }) => {
    await page.goto("/compose");
    await expect(page.getByLabel(/^body$/i)).toBeVisible();
    const { violations } = await audit(page);
    expect(violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("heading levels descend without skipping", async ({ page }) => {
    await page.goto("/");
    await showDev(page);
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
        .filter((node) => (node as HTMLElement).offsetParent !== null || getComputedStyle(node).position === "fixed")
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

  test("the floor takes keyboard focus and shows an indicator", async ({ page }) => {
    await page.goto("/");
    const floor = page.getByRole("application");
    await floor.focus();
    await expect(floor).toBeFocused();

    const outline = await floor.evaluate((node) => {
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
