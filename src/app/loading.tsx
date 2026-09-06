import { PageLoading } from "@/components/ui/loading";

/**
 * The page-to-page wait.
 *
 * Next renders this the moment a route transition starts and tears it down only
 * once the next page is ready to paint — so it covers the whole gap, however
 * long the chunk takes, and ends exactly when the new page arrives. Nothing here
 * needs a timer or a completion guess.
 *
 * It sits inside the shell's padded container, so it needs no layout of its own.
 */
export default function RouteLoading() {
  return <PageLoading />;
}
