import { expect, test } from "bun:test";
import { QUESTIONS } from "../src/triage/questions";
import { TEAM_CHOICES } from "../src/types";

test("team question offers exactly the choices the answer schema accepts", () => {
  expect(Object.keys(QUESTIONS.team.criteria).sort()).toEqual([...TEAM_CHOICES].sort());
});

test("score questions have the level counts the schema expects", () => {
  expect(QUESTIONS.impact_severity.criteria).toHaveLength(5);
  expect(QUESTIONS.time_pressure.criteria).toHaveLength(4);
  expect(QUESTIONS.customer_frustration.criteria).toHaveLength(4);
});
