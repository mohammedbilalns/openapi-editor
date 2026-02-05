"use client";

import { useState, useEffect, useRef, type RefObject } from "react";

/**
 * Hook that tracks the width of a container element using ResizeObserver.
 * Uses hysteresis to prevent flickering when width hovers around the threshold.
 * 
 * Hysteresis means:
 * - To enter compact mode: width must go below (threshold - buffer)
 * - To exit compact mode: width must go above (threshold + buffer)
 * This prevents rapid toggling when the width is near the threshold.
 */
export function useContainerWidth<T extends HTMLElement = HTMLDivElement>(
  threshold: number = 500,
  hysteresisBuffer: number = 30
): {
  ref: RefObject<T | null>;
  width: number;
  isCompact: boolean;
} {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        setWidth(newWidth);
      }
    });

    observer.observe(element);
    setWidth(element.offsetWidth);

    return () => observer.disconnect();
  }, []);

  // Apply hysteresis to prevent flickering
  useEffect(() => {
    if (width === 0) return;
    
    if (isCompact) {
      // Currently compact - only exit if width goes above threshold + buffer
      if (width > threshold + hysteresisBuffer) {
        setIsCompact(false);
      }
    } else {
      // Currently not compact - only enter if width goes below threshold - buffer
      if (width < threshold - hysteresisBuffer) {
        setIsCompact(true);
      }
    }
  }, [width, threshold, hysteresisBuffer, isCompact]);

  return {
    ref,
    width,
    isCompact,
  };
}
