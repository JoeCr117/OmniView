"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fullscreens a single element via the native Fullscreen API (no library -
 * the unprefixed API is universal in evergreen browsers). Attach `ref` to
 * the element; Esc and browser chrome exits are reflected in `isFullscreen`
 * through the fullscreenchange listener.
 */
export function useFullscreen<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement !== null && document.fullscreenElement === ref.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const enter = useCallback(async () => {
    // requestFullscreen rejects when the browser denies it (no user gesture,
    // iframe policy, ...) - treat that as a no-op rather than an error.
    try {
      await ref.current?.requestFullscreen();
    } catch {
      setIsFullscreen(false);
    }
  }, []);

  const exit = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // Already exited (or never entered) - nothing to do.
      }
    }
  }, []);

  const toggle = useCallback(async () => {
    if (document.fullscreenElement === ref.current && document.fullscreenElement !== null) {
      await exit();
    } else {
      await enter();
    }
  }, [enter, exit]);

  return { ref, isFullscreen, enter, exit, toggle };
}
