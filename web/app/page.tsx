import { Workbench } from "@/components/workbench/workbench";
import { loadTickets } from "@/lib/fixtures";

export default async function Page() {
  return <Workbench seed={await loadTickets()} />;
}
