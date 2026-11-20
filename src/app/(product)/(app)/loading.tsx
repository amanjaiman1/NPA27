import { PageLoading } from "@/components/ui/loading";

/**
 * The page-to-page wait, when the next page's address is in but its code
 * isn't yet.
 *
 * Next shows this once a page change has committed and the page itself is
 * still loading, and takes it down when the page is ready to paint, so it
 * covers that gap however long the code takes. The progress bar along the
 * top runs until it goes (`RouteProgressHold`, in `PageLoading`): on a phone,
 * where the dots are hidden, the bar is what says "on its way".
 *
 * It sits inside the shell's padded container, so it needs no layout of its own.
 */
export default function RouteLoading() {
  return <PageLoading />;
}
