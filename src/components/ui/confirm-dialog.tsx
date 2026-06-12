"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Modal } from "./modal";
import { Button } from "./button";
import { cn } from "@/lib/utils";

type ConfirmTone = "danger" | "default";

export interface ConfirmOptions {
  /** Headline question, e.g. "Delete this mock test?" */
  title: string;
  /** Optional supporting sentence explaining the consequence. */
  description?: string;
  /** Label for the affirmative button (defaults by tone). */
  confirmLabel?: string;
  /** Label for the dismissive button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** "danger" (destructive, red) or "default" (neutral, accent). */
  tone?: ConfirmTone;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface DialogState extends ConfirmOptions {
  open: boolean;
}

/**
 * App-wide confirmation popup. Mount once near the root, then call the
 * imperative `useConfirm()` hook anywhere:
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: "Delete this?", tone: "danger" })) remove(id);
 *
 * The promise resolves `true` on confirm and `false` on cancel / dismiss
 * (Escape, backdrop click, or the X), so call sites stay a one-liner.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>({ open: false, title: "" });
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      // If a previous prompt is somehow still pending, dismiss it as cancelled.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setState({ ...options, open: true });
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState((s) => ({ ...s, open: false }));
  }, []);

  const tone: ConfirmTone = state.tone ?? "danger";
  const danger = tone === "danger";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={state.open}
        onClose={() => settle(false)}
        className="sm:max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {state.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              onClick={() => settle(true)}
            >
              {state.confirmLabel ?? (danger ? "Delete" : "Confirm")}
            </Button>
          </>
        }
      >
        <div className="flex gap-4">
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-full",
              danger ? "bg-danger/12 text-danger" : "bg-accent/15 text-accent",
            )}
          >
            {danger ? (
              <Trash2 className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 className="text-base font-semibold tracking-snugg text-paper">
              {state.title}
            </h2>
            {state.description && (
              <p className="mt-1 text-sm leading-relaxed text-paper/55">
                {state.description}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** Imperative confirmation prompt. Must be used within a ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within a <ConfirmProvider>");
  }
  return ctx;
}
