import { METRIC_IDS } from "@/lib/metrics";
import { MetricPage } from "./metric-page";

/**
 * One page per measurement (sleep, running, weight, screen time), built ahead
 * of time. The list is fixed, so every one of them is a static page: opening
 * one is answered at once, with no server work. Before, each visit asked the
 * server to render it, which on a quiet server took the best part of a second.
 * Any other address is a 404.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return METRIC_IDS.map((metric) => ({ metric }));
}

export default function Page() {
  return <MetricPage />;
}
