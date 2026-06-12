"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { allNavItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allNavItems;
    return allNavItems.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        i.short.toLowerCase().includes(q) ||
        i.href.toLowerCase().includes(q),
    );
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  function go(href: string) {
    router.push(href);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[active];
      if (item) go(item.href);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-paper/12 bg-ink shadow-glow"
          >
            <div className="flex items-center gap-3 border-b border-paper/[0.08] px-4">
              <Search className="h-4 w-4 text-paper/40" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Jump to a module, search the Chronicle…"
                className="h-14 flex-1 bg-transparent text-[0.95rem] text-paper placeholder:text-paper/35 focus:outline-none"
              />
              <kbd className="rounded-md border border-paper/10 bg-paper/[0.04] px-1.5 py-0.5 font-mono text-[0.6rem] text-paper/40">
                ESC
              </kbd>
            </div>

            <div className="no-scrollbar max-h-[52vh] overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-paper/40">
                  No modules match “{query}”.
                </p>
              )}
              {results.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    onClick={() => go(item.href)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      i === active ? "bg-paper/[0.08]" : "hover:bg-paper/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-paper/10",
                        i === active ? "bg-paper text-ink" : "bg-paper/[0.03] text-paper/60",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-paper">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-paper/40">
                        {item.short}
                      </span>
                    </span>
                    {i === active && (
                      <CornerDownLeft className="h-4 w-4 text-paper/40" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 border-t border-paper/[0.08] px-4 py-2.5 text-[0.65rem] text-paper/35">
              <span className="flex items-center gap-1">
                <ArrowUp className="h-3 w-3" />
                <ArrowDown className="h-3 w-3" /> navigate
              </span>
              <span className="flex items-center gap-1">
                <CornerDownLeft className="h-3 w-3" /> open
              </span>
              <span className="ml-auto font-mono">The UPSC Chronicle</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
