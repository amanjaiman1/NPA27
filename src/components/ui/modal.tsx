"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useMounted } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * A shared stack of open modals so that nested/stacked dialogs cooperate:
 *  - the body scroll-lock is reference-counted (it only releases once the
 *    last open modal closes), and
 *  - the Escape key only closes the top-most modal.
 */
const modalStack: object[] = [];

function lockScroll() {
  if (modalStack.length === 1) document.body.style.overflow = "hidden";
}
function unlockScroll() {
  if (modalStack.length === 0) document.body.style.overflow = "";
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const mounted = useMounted();

  useEffect(() => {
    if (!open) return;
    const token = {};
    modalStack.push(token);
    lockScroll();
    const handler = (e: KeyboardEvent) => {
      // Only the top-most modal reacts to Escape.
      if (e.key !== "Escape") return;
      if (modalStack[modalStack.length - 1] !== token) return;
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      const idx = modalStack.indexOf(token);
      if (idx >= 0) modalStack.splice(idx, 1);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-scrim/45 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-card shadow-lift sm:max-w-lg sm:rounded-3xl",
              className,
            )}
          >
            {(title || description) && (
              <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                <div>
                  {title && (
                    <h2 className="font-display text-lg font-semibold tracking-snugg text-paper">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="mt-0.5 text-sm text-paper/50">{description}</p>
                  )}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-paper/45 transition-colors hover:bg-paper/[0.06] hover:text-paper"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="no-scrollbar flex-1 overflow-y-auto px-5 py-5">
              {children}
            </div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
