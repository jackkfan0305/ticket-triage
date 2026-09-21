import { parseArgs } from "node:util";
import { askJev } from "./triage/run";
import { decide } from "./triage/policy";

const USAGE = 'usage: bun src/cli.ts --subject "..." --body "..."';

const { values } = parseArgs({
  options: { subject: { type: "string", default: "" }, body: { type: "string" } },
});

if (!values.body?.trim()) {
  console.error(USAGE);
  process.exit(2);
}

try {
  const started = performance.now();
  const { model, answers } = await askJev({ id: "cli", subject: values.subject, body: values.body });
  const ms = Math.round(performance.now() - started);
  console.log(JSON.stringify({ model, ms, decision: decide(answers) }, null, 2));
} catch (err) {
  console.error(`triage failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
