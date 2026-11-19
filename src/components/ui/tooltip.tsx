"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════════════
   TOOLTIP
   A short explanation of what a control does, shown above it (or below,
   near the top of the screen) when the pointer rests on it or it gets
   keyboard focus, and gone on Escape, blur or leaving. It never holds
   anything you must read to use the app: helper text under a field does
   that job, and works on touch screens too.

   Screen readers hear it as the control's description: the text is also
   in the page, visually hidden, and the control points at it with
   `aria-describedby`. Replaces the browser's own `title` tooltips, which
   keyboards can't open.
   ════════════════════════════════════════════════════════════════ */

type TriggerProps = {
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  "aria-describedby"?: string;
  ref?: React.Ref<HTMLElement>;
};

const GAP = 8;
const MARGIN = 8;

export function Tooltip({
  content,
  children,
  side = "top",
  delay = 380,
  describe = true,
  srText,
  className,
}: {
  content: React.ReactNode;
  /** One element that can take focus: a button or a link. */
  children: React.ReactElement;
  side?: "top" | "bottom";
  delay?: number;
  /**
   * Also announce the text as the control's description. Off when the text
   * only repeats the control's name (an icon button's label).
   */
  describe?: boolean;
  /** What screen readers hear instead of `content`, when that repeats the name. */
  srText?: string;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();

  const show = useCallback(
    (wait: number) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setOpen(true), wait);
    },
    [],
  );
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Placed after it renders, so its own size is known: centred on the
  // control, kept on screen, flipped below when there's no room above.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect();
      const b = bubble.current?.getBoundingClientRect();
      if (!t || !b) return;
      let below = side === "bottom";
      if (!below && t.top - b.height - GAP < MARGIN) below = true;
      if (below && t.bottom + b.height + GAP > window.innerHeight - MARGIN && t.top - b.height - GAP >= MARGIN) below = false;
      const x = Math.min(window.innerWidth - MARGIN - b.width / 2, Math.max(MARGIN + b.width / 2, t.left + t.width / 2));
      const y = below ? t.bottom + GAP : t.top - GAP - b.height;
      setPos({ x, y, below });
    };
    place();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [open, side, hide]);

  if (!isValidElement(children)) return children;
  const props = children.props as TriggerProps;
  const describedBy = [props["aria-describedby"], describe && content ? `${id}-text` : undefined].filter(Boolean).join(" ") || undefined;

  const child = cloneElement(children as React.ReactElement<TriggerProps>, {
    ref: (node: HTMLElement | null) => {
      trigger.current = node;
      const r = (children as unknown as { ref?: React.Ref<HTMLElement> }).ref;
      if (typeof r === "function") r(node);
      else if (r && typeof r === "object") (r as React.MutableRefObject<HTMLElement | null>).current = node;
    },
    "aria-describedby": describedBy,
    onPointerEnter: (e: React.PointerEvent) => {
      props.onPointerEnter?.(e);
      if (e.pointerType === "mouse") show(delay);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      props.onPointerLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      props.onFocus?.(e);
      // Only for keyboard focus, so a click doesn't leave a bubble behind.
      if ((e.target as HTMLElement).matches?.(":focus-visible")) show(120);
    },
    onBlur: (e: React.FocusEvent) => {
      props.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      props.onKeyDown?.(e);
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        hide();
      }
    },
    onClick: (e: React.MouseEvent) => {
      props.onClick?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {describe && content && (
        <span id={`${id}-text`} className="sr-only">
          {srText ?? content}
        </span>
      )}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && content && (
              <motion.div
                ref={bubble}
                role="tooltip"
                aria-hidden
                initial={{ opacity: 0, scale: 0.96, y: pos?.below ? -3 : 3 }}
                animate={{ opacity: pos ? 1 : 0, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{ left: pos?.x ?? -9999, top: pos?.y ?? -9999, translateX: "-50%" }}
                className={cn(
                  "glass-overlay pointer-events-none fixed z-[80] max-w-[17rem] rounded-xl border border-line px-3 py-2 text-[0.74rem] leading-snug text-paper shadow-lift",
                  className,
                )}
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
