import { Spinner } from "./spinner";

/**
 * The page loading state — a single small spinner, centred in the content area.
 *
 * This used to be a skeleton: a stack of shimmering grey blocks roughly shaped
 * like the page. It was replaced because the shape it guessed was wrong on most
 * of the twenty-odd pages that use it, so instead of previewing the layout it
 * flashed a different wrong layout on each one. A spinner claims nothing about
 * what is coming.
 *
 * The min-height is what centres it: this renders inside the shell's padded
 * container, which would otherwise collapse to the spinner's own 20px and leave
 * it tucked under the topbar.
 */
export function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center">
      <Spinner />
    </div>
  );
}
