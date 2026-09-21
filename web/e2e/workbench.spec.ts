import { expect, test, type Page } from "@playwright/test";
import { openCompose } from "./open-compose";

/**
 * Every classification now comes from a live run: there is no cached answer
 * file. So anything that needs a verdict stubs /api/classify and asserts on
 * what the browser does with the answer, not on what the model says.
 */
const TEAMS = ["billing", "technical_support", "account_access", "onboarding", "sales", "product_feedback"] as const;

const answersFor = (team: string, impact: number, outage = 0.1) => ({
  has_request: { type: "noul", noul: 0.9 },
  is_security_or_data_loss: { type: "noul", noul: 0.1 },
  is_outage: { type: "noul", noul: outage },
  impact_severity: { type: "score", score: impact, confidence: 0.9, probabilities: { "0": 1 } },
  time_pressure: { type: "score", score: 2, confidence: 0.82, probabilities: { "0": 1 } },
  customer_frustration: { type: "score", score: 1, confidence: 0.77, probabilities: { "0": 1 } },
  team: { type: "choice", choice: team, confidence: 0.9, probabilities: { [team]: 0.9 } },
});

/**
 * The floor's run is one request now: the pool lives in /api/classify/run and
 * the response is NDJSON, one line per event. A stub therefore answers with
 * the whole run at once, which is why nothing here asserts on a half-finished
 * pool; only the server can hold one open.
 */
const runStream = (
  tickets: readonly { id: string }[],
  answersAt: (index: number) => object,
  concurrency = 8,
) =>
  [
    JSON.stringify({ type: "open", concurrency }),
    ...tickets.flatMap((ticket, index) => [
      JSON.stringify({ type: "start", id: ticket.id }),
      JSON.stringify({
        type: "done",
        id: ticket.id,
        model: "stub-1",
        answers: answersAt(index),
        latencyMs: 100 + (index % 50),
      }),
    ]),
    "",
  ].join("\n");

const stubRun = async (page: Page, answersAt: (index: number) => object, concurrency = 8) => {
  await page.route("**/api/classify/run", async (route) => {
    const { tickets } = route.request().postDataJSON() as { tickets: { id: string }[] };
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: runStream(tickets, answersAt, concurrency),
    });
  });
};

/** Round-robins the roster so every card receives work, and gates one ticket
 *  on the outage branch so the evidence view has a forced priority to show. */
const stubClassify = async (page: Page) => {
  await stubRun(page, (index) =>
    answersFor(TEAMS[index % TEAMS.length] as string, (index + 1) % 5, index === 0 ? 0.95 : 0.1),
  );
};

/**
 * A run the stub holds open until the test releases it. The pool is the
 * server's, so this is the only way to act on a floor mid-run.
 */
const heldRun = async (page: Page, answersAt: (index: number) => object) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/classify/run", async (route) => {
    const { tickets } = route.request().postDataJSON() as { tickets: { id: string }[] };
    await held;
    await route.fulfill({ contentType: "application/x-ndjson", body: runStream(tickets, answersAt) });
  });
  return () => release();
};

/**
 * Every ticket gets the same answer, so the verdict under test is known before
 * the run starts: impact 3 of 4, time 2 of 3, frustration 1 of 3 weighs out at
 * urgency 0.683, which is the high band under the default thresholds.
 */
const URGENCY = 0.6833;

/** Both routes: the floor's run streams, and a single ticket's own Classify
 *  button still posts to /api/classify. */
const stubUniform = async (page: Page, outage = 0.1) => {
  const answers = answersFor("billing", 3, outage);
  await stubRun(page, () => answers);
  await page.route("**/api/classify", (route) =>
    route.fulfill({ json: { model: "stub-1", answers, latencyMs: 120 } }),
  );
};

/** The sample dropdown is a listbox, not a native select: open it, then pick. */
const chooseSample = async (page: Page, size: number) => {
  await page.getByRole("combobox", { name: /how many tickets/i }).click();
  await page.getByRole("option", { name: `${size} tickets` }).click();
  await expect(countOn(page, "inbox")).toHaveText(String(size));
};

const countOn = (page: Page, card: string) => page.locator(`[data-card="${card}"] h2 + span`);

/**
 * Throws a card down and to the left.
 *
 * The step delay is not padding. A real pointer emits moves over many frames,
 * and the floor leads the held card once per frame; WebKit delivers synthetic
 * moves faster than one frame, so an unpaced drag can start and finish between
 * two frames and the card never moves at all.
 */
const dragCard = async (page: Page, id: string) => {
  const box = (await page.locator(`[data-card="${id}"]`).boundingBox()) as {
    x: number;
    y: number;
    width: number;
  };
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(box.x + box.width / 2 - step * 18, box.y + 8 + step * 9);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
};

/**
 * A card under the pointer is raised, so its box is read with the pointer off
 * it: the lift is not a position, and only positions are under test here.
 */
const boxAtRest = async (page: Page, id: string) => {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(400);
  return (await page.locator(`[data-card="${id}"]`).boundingBox()) as { x: number; y: number };
};

/** Waits for a thrown card to coast to a stop rather than guessing at a delay:
 *  friction takes a full throw about two and a half seconds to reach rest. */
const settleCard = async (page: Page, id: string) => {
  const card = page.locator(`[data-card="${id}"]`);
  let last = "";
  for (let poll = 0; poll < 80; poll += 1) {
    const now = await card.evaluate((node) => (node as HTMLElement).style.transform);
    if (now === last) return;
    last = now;
    await page.waitForTimeout(100);
  }
};

/** The floor frames itself after hydration and the page has an entrance tween. */
const settled = async (page: Page) => {
  await expect(page.locator("[data-card]")).toHaveCount(8);
  await expect(page.locator(".origin-top-left")).toHaveAttribute("style", /scale\(/);
  await page.waitForTimeout(600);
};

/** The thresholds live in the developer panel now, behind its own toggle. */
const openPolicyDrawer = async (page: Page) => {
  const dev = page.getByRole("button", { name: /show developer mode/i });
  if (await dev.isVisible()) await dev.click();
  const urgent = page.getByRole("slider", { name: /urgent/i });
  if (!(await urgent.isVisible())) await page.getByRole("button", { name: /policy parameters/i }).click();
  await expect(urgent).toBeVisible();
};

const openHeldFixed = async (page: Page) => {
  await openPolicyDrawer(page);
  const gate = page.getByRole("slider", { name: /outageAbove/i });
  if (!(await gate.isVisible())) await page.getByRole("button", { name: /held fixed in sweeps/i }).click();
  await expect(gate).toBeVisible();
};

test.describe("the triage floor", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /^start$/i })).toBeVisible();
  });

  test("moving tickets use the same priority marker as their destination rows", async ({ page }) => {
    await stubUniform(page);
    await settled(page);
    const flightAppearance = page.evaluate(() => new Promise<{ path: string | null; rounded: boolean; border: string; text: string | null }>((resolve) => {
      const observer = new MutationObserver(() => {
        const ticket = document.querySelector<HTMLElement>("[data-ticket-flight] > div");
        if (!ticket) return;
        const style = getComputedStyle(ticket);
        observer.disconnect();
        resolve({
          path: ticket.querySelector("path")?.getAttribute("d") ?? null,
          rounded: Number.parseFloat(style.borderRadius) >= ticket.offsetHeight / 2,
          border: style.borderLeftWidth,
          text: ticket.querySelector("span")?.textContent ?? null,
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }));
    await page.getByRole("button", { name: /^start$/i }).click();
    const flight = await flightAppearance;
    expect(flight.path).toBeTruthy();
    expect(flight.rounded).toBe(true);
    expect(flight.border).toBe("1px");
    expect(flight.text).toBeTruthy();
    const rowMarker = page.locator('[data-card="billing"] li svg path').first();
    await expect(rowMarker).toHaveAttribute("d", flight.path!);
    await expect(page.locator("[data-ticket-flight]")).toHaveCount(0);
  });

  test("boots with every ticket in the inbox and nothing routed", async ({ page }) => {
    await settled(page);
    await expect(page.getByRole("button", { name: /^start$/i })).toBeEnabled();
    await expect(countOn(page, "inbox")).toHaveText("50");
    for (const team of TEAMS) await expect(countOn(page, team)).toHaveText("0");
    await expect(countOn(page, "none")).toHaveText("0");
  });

  test("the sample selector decides how many tickets are on the floor", async ({ page }) => {
    await settled(page);
    await chooseSample(page, 100);
    await expect(page.getByRole("button", { name: /^start$/i })).toBeEnabled();
  });

  test("the floor's heading is read, not drawn over the canvas", async ({ page }) => {
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toHaveText("Ticket Triage");
    // it belongs to the page, so no panel of chrome carries it
    await expect(page.locator(".hud").getByRole("heading", { level: 1 })).toHaveCount(0);
    await expect(page.getByText(/live run|cached run|not run yet/i)).toHaveCount(0);
  });

  test("run state is readable from the button alone", async ({ page }) => {
    // The pool is the server's now, so a stub answers the whole run in one
    // body: the only way to catch the button mid-run is to hold the response.
    const answers = answersFor("billing", 3);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/classify/run", async (route) => {
      const { tickets } = route.request().postDataJSON() as { tickets: { id: string }[] };
      await held;
      await route.fulfill({ contentType: "application/x-ndjson", body: runStream(tickets, () => answers) });
    });

    await settled(page);
    // the largest sample, so the run route also sees its biggest body
    await chooseSample(page, 1000);
    await page.getByRole("button", { name: /^start$/i }).click();

    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();
    await page.getByRole("button", { name: /^pause$/i }).click();
    await expect(page.getByRole("button", { name: /^resume$/i })).toBeVisible();
    await expect(countOn(page, "inbox")).toHaveText("1000");

    await page.getByRole("button", { name: /^resume$/i }).click();
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();

    release();
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 60_000 });
    await expect(countOn(page, "inbox")).toHaveText("0");
  });

  test("reset clears the run and leaves the arrangement alone", async ({ page }) => {
    await stubUniform(page);
    await settled(page);

    const card = page.locator('[data-card="billing"]');
    await dragCard(page, "billing");
    await settleCard(page, "billing");
    const moved = await boxAtRest(page, "billing");

    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(countOn(page, "billing")).not.toHaveText("0", { timeout: 30_000 });

    await page.getByRole("button", { name: /reset the run/i }).click();
    await expect(countOn(page, "inbox")).toHaveText("50");
    await expect(countOn(page, "billing")).toHaveText("0");

    const after = (await card.boundingBox()) as { x: number; y: number };
    expect(Math.abs(after.x - moved.x)).toBeLessThan(2);
    expect(Math.abs(after.y - moved.y)).toBeLessThan(2);
  });

  test("developer mode is one pressed toggle, and it owns the statistics", async ({ page }) => {
    await settled(page);
    await expect(page.getByRole("heading", { name: /model latency/i })).toBeHidden();

    const toggle = page.getByRole("button", { name: /show developer mode/i });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();

    await expect(page.getByRole("heading", { name: /model latency/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /reset params/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /hide developer mode/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("no panel overlaps another", async ({ page }) => {
    await settled(page);
    await page.getByRole("button", { name: /show developer mode/i }).click();

    const boxes = await page.locator(".hud > *").evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })),
    );
    const overlaps: string[] = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i] as { x: number; y: number; w: number; h: number };
        const b = boxes[j] as { x: number; y: number; w: number; h: number };
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${i}/${j}`);
      }
    }
    expect(overlaps, JSON.stringify(boxes)).toEqual([]);
  });

  test("draws one route from the inbox to every destination", async ({ page }) => {
    await settled(page);
    const drawn = await page.locator("svg path[data-node]").evaluateAll((nodes) =>
      nodes.filter((node) => (node.getAttribute("d") ?? "").startsWith("M ")).length,
    );
    expect(drawn).toBe(7);
  });

  test("shows no accuracy metric, because the eval set carries no labels", async ({ page }) => {
    await expect(page.getByText(/exact match|urgent recall|routing accuracy/i)).toHaveCount(0);
  });

  test("a run moves tickets out of the inbox and onto the teams", async ({ page }) => {
    await stubClassify(page);
    await settled(page);
    await page.getByRole("button", { name: /^start$/i }).click();

    for (const team of TEAMS) {
      await expect(countOn(page, team)).not.toHaveText("0", { timeout: 30_000 });
    }
    await expect(countOn(page, "inbox")).not.toHaveText("50");
  });

  test("a thrown card exerts no force on any other card, and never selects text", async ({ page }) => {
    await settled(page);

    const read = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[data-card]")].map((node) => {
          const box = node.getBoundingClientRect();
          return { id: (node as HTMLElement).dataset.card as string, x: box.x, y: box.y };
        }),
      );

    const before = new Map((await read()).map((card) => [card.id, card]));
    await dragCard(page, "billing");
    await settleCard(page, "billing");
    await boxAtRest(page, "billing");

    expect(await page.evaluate(() => String(window.getSelection() ?? ""))).toBe("");

    const moved = (await read()).filter((card) => {
      const was = before.get(card.id) as { x: number; y: number };
      return Math.abs(card.x - was.x) > 1 || Math.abs(card.y - was.y) > 1;
    });
    expect(moved.map((card) => card.id)).toEqual(["billing"]);
  });

  test("a card lifts under the pointer and settles when it leaves", async ({ page }) => {
    await settled(page);
    const card = page.locator('[data-card="billing"]');
    const transform = () => card.evaluate((node) => (node as HTMLElement).style.transform);
    const box = (await card.boundingBox()) as { x: number; y: number; width: number; height: number };

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect.poll(transform).toContain("scale(");

    await page.mouse.move(2, 2);
    await expect.poll(transform).not.toContain("scale(");
  });

  test("the camera pans, zooms, frames and tidies", async ({ page }) => {
    await settled(page);
    const card = page.locator("[data-card]").first();
    const left = async () => ((await card.boundingBox()) as { x: number }).x;

    const before = await left();
    await page.getByRole("application").focus();
    await page.keyboard.press("ArrowLeft");
    expect(await left()).toBeGreaterThan(before);

    const zoom = page.getByRole("status").filter({ hasText: "%" });
    const start = await zoom.textContent();
    await page.getByRole("button", { name: "Zoom in" }).click();
    expect(await zoom.textContent()).not.toBe(start);

    await page.getByRole("button", { name: "Frame everything" }).click();
    await page.getByRole("button", { name: "Tidy the layout" }).click();
  });

  test("a card opens its own pile, and that text stays selectable", async ({ page }) => {
    await settled(page);
    await page.locator('[data-card="inbox"] h2 button').click();

    const sheet = page.getByRole("complementary");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("heading", { name: /unrouted inbox/i })).toBeVisible();
    expect(await sheet.evaluate((node) => getComputedStyle(node).userSelect)).not.toBe("none");
    await expect(sheet.locator("li")).not.toHaveCount(0);

    await page.getByRole("searchbox", { name: /search tickets/i }).fill("hf-8193");
    await expect(sheet.locator("li")).toHaveCount(1);
    await expect(sheet.getByRole("link")).toHaveAttribute("href", "/tickets/hf-8193");

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("the inbox pile reports how many tickets the server sends at once", async ({ page }) => {
    // the number belongs to the run route now, and reaches the floor on the
    // stream's first line rather than being a constant in the browser
    await stubRun(page, () => answersFor("billing", 3), 24);

    await settled(page);
    await page.locator('[data-card="inbox"] h2 button').click();
    const sheet = page.getByRole("complementary");
    await expect(sheet.getByText("not asked yet")).toHaveCount(50);
    await expect(page.getByText(/8 go to the model at a time/)).toBeVisible();

    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/24 go to the model at a time/)).toBeVisible();
  });

  test("a press anywhere on a card opens its pile", async ({ page }) => {
    await settled(page);
    const box = (await page.locator('[data-card="inbox"]').boundingBox()) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    // the middle of the pile, well clear of the heading and its button
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    const sheet = page.getByRole("complementary");
    await expect(sheet.getByRole("heading", { name: /unrouted inbox/i })).toBeVisible();
  });

  test("the wheel scrolls the pile under the pointer, and leaves the camera alone", async ({ page }) => {
    await settled(page);
    const pane = page.locator('[data-card="inbox"] [data-scroll]');
    const box = (await pane.boundingBox()) as { x: number; y: number; width: number; height: number };
    const zoom = await page.getByRole("status").filter({ hasText: "%" }).textContent();

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);
    await expect
      .poll(async () => pane.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(0);
    expect(await page.getByRole("status").filter({ hasText: "%" }).textContent()).toBe(zoom);
  });

  /** Runs until the billing card has work, then opens the first ticket on it. */
  const openFirstRouted = async (page: Page) => {
    await settled(page);
    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(countOn(page, "billing")).not.toHaveText("0", { timeout: 30_000 });
    await page.locator('[data-card="billing"] h2 button').click();
    await page.getByRole("complementary").locator("li a").first().click();
    await expect(page).toHaveURL(/\/tickets\/hf-\d+$/);
    await expect(page.getByText(/scored judgments/i)).toBeVisible();
  };

  test("a ticket has an address, and back returns to the run", async ({ page }) => {
    await stubUniform(page);
    await openFirstRouted(page);

    const url = page.url();
    await expect(page.getByRole("heading", { level: 1, name: "Ticket Triage" })).toBeVisible();
    await expect(page.locator("[data-stat='priority'] dd")).toHaveText(
      new RegExp(`high.*${URGENCY.toFixed(3)}`),
    );

    await page.goBack();
    await expect(page.getByRole("application")).toBeVisible();
    await expect(countOn(page, "billing")).not.toHaveText("0");

    await page.goto(url);
    await expect(page.getByText("Not classified", { exact: true })).toBeVisible();
    await expect(page.locator("[data-stat='priority']")).toHaveCount(0);
  });

  test("a reset drops the evidence a ticket route is reading", async ({ page }) => {
    await stubUniform(page);
    await openFirstRouted(page);

    await page.goBack();
    await expect(page.getByRole("application")).toBeVisible();
    await page.getByRole("button", { name: /reset the run/i }).click();
    await expect(countOn(page, "inbox")).toHaveText("50");

    // forward is a soft navigation: same session, same answers, if any survived
    await page.goForward();
    await expect(page.getByText("Not classified", { exact: true })).toBeVisible();
    await expect(page.getByText(/scored judgments/i)).toHaveCount(0);
  });

  test("a run in flight survives a trip to a ticket and back", async ({ page }) => {
    const answers = answersFor("billing", 3);
    const release = await heldRun(page, () => answers);

    await settled(page);
    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();

    await page.locator('[data-card="inbox"] h2 button').click();
    await page.getByRole("complementary").locator("li a").first().click();
    await expect(page).toHaveURL(/\/tickets\/hf-\d+$/);

    await page.goBack();
    await expect(page.getByRole("application")).toBeVisible();
    // the run never stopped, so the floor offers the pause, not a second start
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();

    release();
    await expect(countOn(page, "inbox")).toHaveText("0", { timeout: 60_000 });
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible();
  });

  test("a pause the server refuses puts the button back", async ({ page }) => {
    const answers = answersFor("billing", 3);
    const release = await heldRun(page, () => answers);
    await page.route("**/api/classify/pause", (route) =>
      route.fulfill({ status: 503, json: { error: "The run is not on this instance." } }),
    );

    await settled(page);
    await page.getByRole("button", { name: /^start$/i }).click();
    await page.getByRole("button", { name: /^pause$/i }).click();

    // the model is still being sent tickets, so the button may not claim a hold
    await expect(page.getByRole("status").filter({ hasText: /did not pause/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^pause$/i })).toBeVisible();

    release();
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 60_000 });
  });

  test("opening and reloading a ticket does not classify it", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/classify", (route) => {
      calls += 1;
      return route.fulfill({
        json: { model: "stub-1", answers: answersFor("billing", 3, 0.1), latencyMs: 120 },
      });
    });

    await page.goto("/tickets/hf-8193");
    await expect(page.getByText("Not classified", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assistance Required from Customer Support" })).toBeVisible();
    await expect(page.getByText(/supply comprehensive documentation/)).toBeVisible();
    await expect(page.getByText(/scored judgments/i)).toHaveCount(0);
    expect(calls).toBe(0);

    await page.reload();
    await expect(page.getByText("Not classified", { exact: true })).toBeVisible();
    await expect(page.getByText("hf-8193", { exact: true })).toBeVisible();
    expect(calls).toBe(0);
  });

  test("an unknown ticket id renders the 404, not a crash", async ({ page }) => {
    const response = await page.goto("/tickets/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
  });

  test("ticket content is available when classification would fail", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/classify", (route) => {
      calls += 1;
      return route.fulfill({ status: 502, json: { error: "Classification failed upstream." } });
    });

    await page.goto("/tickets/hf-8193");
    await expect(page.getByRole("heading", { name: "Assistance Required from Customer Support" })).toBeVisible();
    await expect(page.getByText(/supply comprehensive documentation/)).toBeVisible();
    await expect(page.getByText("Not classified", { exact: true })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /classification/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /try again/i })).toHaveCount(0);
    expect(calls).toBe(0);
  });

  test("dragging a threshold re-decides the floor in the browser", async ({ page }) => {
    await stubUniform(page);
    await settled(page);
    await page.getByRole("button", { name: /^start$/i }).click();
    await expect(countOn(page, "billing")).not.toHaveText("0", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^done$/i })).toBeVisible({ timeout: 60_000 });

    // every answer is identical, so every ticket sits in the high band
    const highOnBilling = await countOn(page, "billing").textContent();

    // the model must not be asked again while a threshold moves; the browser's
    // own traffic (favicons, route prefetches) is not what this is about
    let asks = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/classify")) asks += 1;
    });

    await openPolicyDrawer(page);
    const floor = page.getByRole("slider", { name: /team confidence floor/i });
    await floor.focus();
    for (let i = 0; i < 40; i += 1) await page.keyboard.press("ArrowRight");

    // raising the floor past the model's confidence sends the pile to triage
    await expect(countOn(page, "billing")).not.toHaveText(highOnBilling ?? "");
    await expect(countOn(page, "none")).not.toHaveText("0");
    expect(asks).toBe(0);
  });

  test("the outage gate forces urgent, and releasing it hands back to urgency", async ({ page }) => {
    await stubUniform(page, 0.95);
    await openFirstRouted(page);
    await expect(page.getByText(/forced by outage gate/i)).toBeVisible();
    await expect(page.locator("[data-stat='priority'] dd")).toHaveText(/urgent/);
  });

  test("writing a ticket opens over the floor, and closing gives it back", async ({ page }) => {
    await page.getByRole("button", { name: /write your own ticket/i }).click();

    const window = page.getByRole("dialog");
    await expect(window).toBeVisible();
    await expect(window.getByRole("heading", { name: "Write your own ticket" })).toBeVisible();
    // the floor is still there, behind it
    await expect(page.locator("[data-card]")).toHaveCount(8);

    await page.keyboard.press("Escape");
    await expect(window).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test("an ad-hoc ticket keeps its evidence in the window", async ({ page }) => {
    await stubUniform(page);
    await openCompose(page);
    await page.getByRole("button", { name: /sample 1/i }).click();
    await page.getByRole("button", { name: /^classify$/i }).click();

    await expect(page.getByText(/scored judgments/i)).toBeVisible();

    // and the form comes back for the next one
    await page.getByRole("button", { name: /write another/i }).click();
    await expect(page.getByLabel(/^body$/i)).toBeVisible();
  });

  test("compose enforces the same caps the route does", async ({ page }) => {
    await openCompose(page);

    const classify = page.getByRole("button", { name: /^classify$/i });
    await expect(classify).toBeDisabled(); // empty body

    await page.getByRole("button", { name: /sample 1/i }).click();
    await expect(classify).toBeEnabled();
    await expect(page.getByLabel(/^body$/i)).toHaveAttribute("maxlength", "5000");
    await expect(page.getByLabel(/^subject$/i)).toHaveAttribute("maxlength", "200");
  });

  test("every interactive target is at least 24 by 24", async ({ page }) => {
    await settled(page);
    await openHeldFixed(page);
    // the slider's pointer target is its control row, not the hidden range
    // input, so it is measured separately below. aria-hidden shims, like the
    // form input a listbox keeps, are not targets either: nothing can hit them.
    const targets = page.locator(
      "button:visible, a:visible, input:visible:not([type='range']), textarea:visible",
    ).and(page.locator(":not([aria-hidden='true'])"));
    const count = await targets.count();
    const undersized: string[] = [];

    for (let i = 0; i < count; i += 1) {
      const node = targets.nth(i);
      const box = await node.boundingBox();
      if (!box) continue;
      // cards live inside the camera transform; everything in there scales
      if (await node.evaluate((el) => Boolean(el.closest("[data-card]")))) continue;
      if (box.width < 24 || box.height < 24) {
        undersized.push(
          `${(await node.textContent())?.trim() || (await node.getAttribute("aria-label"))} ${box.width}x${box.height}`,
        );
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
  test.use({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });

  test("tickets still reach their team, with no flyer and no tilt", async ({ page }) => {
    await stubClassify(page);
    await page.goto("/");
    await settled(page);

    await page.getByRole("button", { name: /^start$/i }).click();
    for (const team of TEAMS) {
      await expect(countOn(page, team)).not.toHaveText("0", { timeout: 30_000 });
    }

    const tilted = await page.locator("[data-card]").evaluateAll((nodes) =>
      nodes.filter((node) => (node as HTMLElement).style.transform.includes("rotate(")).length,
    );
    expect(tilted).toBe(0);
  });
});
