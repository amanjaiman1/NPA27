"use client";

import { useEffect, useState } from "react";

/** True only after the component has mounted on the client. */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Tracks a CSS media query. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = () => setMatches(m.matches);
    handler();
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, [query]);
  return matches;
}


import { useCallback, useRef } from "react";

/** Measures an element's width, updating on resize. */
export function useMeasure<T extends HTMLElement = HTMLDivElement>(): [
  (node: T | null) => void,
  number,
] {
  const [width, setWidth] = useState(0);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    if (observer.current) {
      observer.current.disconnect();
      observer.current = null;
    }
    if (node) {
      observer.current = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        setWidth(w);
      });
      observer.current.observe(node);
      setWidth(node.getBoundingClientRect().width);
    }
  }, []);

  return [ref, width];
}
