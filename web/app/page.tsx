import { Workbench } from "@/components/workbench/workbench";
import { loadCachedRun } from "@/lib/fixtures";

export default async function Page() {
  const { model, tickets } = await loadCachedRun();
  return <Workbench cachedModel={model} seed={tickets} />;
}
