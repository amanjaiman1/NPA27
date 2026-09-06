import { Loading } from "@/components/ui/loading";

/**
 * Shown while a route's code is still being fetched.
 *
 * Every page here is client-rendered, so navigating to one that hasn't been
 * visited yet has to download its chunk first. Without this boundary that gap
 * renders as an empty column under the topbar; with it, the shape of the page
 * arrives immediately and fills in.
 *
 * It sits inside the shell's padded container, so it needs no layout of its own.
 */
export default function RouteLoading() {
  return <Loading />;
}
