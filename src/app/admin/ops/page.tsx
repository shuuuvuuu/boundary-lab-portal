import { parseTargets } from "@/lib/health-poller";
import { OpsTabs } from "./OpsTabs";

export const dynamic = "force-dynamic";

export default function AdminOpsPage() {
  const targets = parseTargets(process.env.HEALTH_CHECK_TARGETS);
  const services = targets.map((t) => t.service);
  const defaultService = services[0] ?? "boundary";
  return <OpsTabs healthServices={services} defaultHealthService={defaultService} />;
}
