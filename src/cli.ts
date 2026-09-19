import { parseArgs } from "node:util";
import { askJev } from "./triage/run";

const USAGE = 'usage: bun src/cli.ts --subject "..." --body "..."';

const { values } = parseArgs({
  options: { subject: { type: "string", default: "" }, body: { type: "string" } },
});

if (!values.body?.trim()) {
  console.error(USAGE);
  process.exit(2);
}

try {
  const result = await askJev({ id: "cli", subject: values.subject, body: values.body });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error(`triage failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
