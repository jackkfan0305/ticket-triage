import { describe, expect, test } from "bun:test";
import path from "node:path";
import { resolveRoot } from "../lib/env";

describe("resolveRoot", () => {
  test("uses the pinned root regardless of where the process was started", () => {
    // the dev server launched detached runs with cwd "/", where joining ".."
    // lands on "/" and finds no .env at all
    expect(resolveRoot("/repo/ticket-triage", "/")).toBe("/repo/ticket-triage");
  });

  test("falls back to the parent of the cwd when nothing is pinned", () => {
    expect(resolveRoot(undefined, "/repo/ticket-triage/web")).toBe("/repo/ticket-triage");
  });

  test("finds the real key from this repo's root", async () => {
    const { apiKey } = await import("../lib/env");
    process.env.TRIAGE_REPO_ROOT = path.join(import.meta.dir, "..", "..");
    delete process.env.TYPESAFE_API_KEY;
    expect(apiKey()).toBeTruthy();
  });
});
