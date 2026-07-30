"use client";

import { useEffect } from "react";

import { reportClientError } from "@/lib/log";

/**
 * Last-resort boundary: replaces the ROOT layout when it (or Providers)
 * throws, so it must render its own <html>/<body> and cannot rely on
 * globals.css, theme classes, or any provider - hence the inline styles.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError("global-error-boundary", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div role="alert" style={{ maxWidth: "28rem", padding: "1.5rem", textAlign: "center" }}>
          <h2 style={{ marginTop: 0 }}>OmniView hit an unrecoverable error</h2>
          <p style={{ overflowWrap: "break-word", opacity: 0.8 }}>
            {error.message}
            {error.digest ? ` (ref: ${error.digest})` : ""}
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              padding: "0.5rem 1.25rem",
              borderRadius: "0.5rem",
              border: "1px solid #fafafa",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
